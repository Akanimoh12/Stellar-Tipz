import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import FavoritesList from "../FavoritesList";
import { useFavorites } from "../../../hooks/useFavorites";

// Mock useFavorites
vi.mock("../../../hooks/useFavorites", () => ({
  useFavorites: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("FavoritesList", () => {
  const mockRemoveFavorite = vi.fn();
  const mockRecordTip = vi.fn();
  const mockFavorites = [
    { address: "G1", username: "alice", addedAt: 1000, tipCount: 2 },
    { address: "G2", username: "bob", addedAt: 2000, tipCount: 5 },
  ];

  function mockUseFavorites(partial: Partial<ReturnType<typeof useFavorites>>) {
    vi.mocked(useFavorites).mockReturnValue({
      favorites: mockFavorites,
      sortedFavorites: (sortBy: string) => {
        if (sortBy === "alphabetical")
          return [...mockFavorites].sort((a, b) =>
            a.username.localeCompare(b.username),
          );
        if (sortBy === "most_tipped")
          return [...mockFavorites].sort((a, b) => b.tipCount - a.tipCount);
        return [...mockFavorites].sort((a, b) => b.addedAt - a.addedAt);
      },
      removeFavorite: mockRemoveFavorite,
      recordTip: mockRecordTip,
      isFavorite: () => false,
      toggleFavorite: vi.fn(),
      isAuthenticated: true,
      ...partial,
    } as ReturnType<typeof useFavorites>);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFavorites({});

    // Mock window.confirm
    window.confirm = vi.fn(() => true);
  });

  const renderComponent = () =>
    render(
      <BrowserRouter>
        <FavoritesList />
      </BrowserRouter>,
    );

  it("renders empty state when no favorites", () => {
    mockUseFavorites({ favorites: [], sortedFavorites: () => [] });
    renderComponent();

    expect(screen.getByText(/No favorites yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sign in to sync/i)).not.toBeInTheDocument();
  });

  it("renders list of favorites", () => {
    renderComponent();

    expect(screen.getByText(/@alice/i)).toBeInTheDocument();
    expect(screen.getByText(/@bob/i)).toBeInTheDocument();
    expect(screen.getByText(/2 tips sent/i)).toBeInTheDocument();
    expect(screen.getByText(/5 tips sent/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sign in to sync/i)).not.toBeInTheDocument();
  });

  it("calls removeFavorite when remove button is clicked and confirmed", () => {
    renderComponent();

    const removeButtons = screen.getAllByTitle(/Remove/i);
    fireEvent.click(removeButtons[0]);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockRemoveFavorite).toHaveBeenCalledWith("G2"); // G2 is Bob, who is first in 'recent' sort (addedAt 2000)
  });

  it("navigates to tip page when quick tip button is clicked", () => {
    renderComponent();

    const tipButtons = screen.getAllByTitle(/Quick Tip/i);
    fireEvent.click(tipButtons[0]);

    expect(mockRecordTip).toHaveBeenCalledWith("G2");
    expect(mockNavigate).toHaveBeenCalledWith("/@bob");
  });

  it("shows sign-in prompt when unauthenticated with local favorites", () => {
    mockUseFavorites({ isAuthenticated: false });
    renderComponent();

    expect(
      screen.getByText(/Sign in to sync your favorites/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/@alice/i)).toBeInTheDocument();
  });

  it("sign-in prompt navigates home", () => {
    mockUseFavorites({ isAuthenticated: false });
    renderComponent();

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
