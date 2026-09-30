import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, Link } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import TransactionNavigationBlock from "../TransactionNavigationBlock";
import { useActiveTransactionCount } from "@/hooks/useTransactionGuard";

// Mock the guard hook so the test controls the registry count directly.
vi.mock("@/hooks/useTransactionGuard", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/hooks/useTransactionGuard")
  >();
  return {
    ...actual,
    useActiveTransactionCount: vi.fn(),
  };
});

const mockedCount = vi.mocked(useActiveTransactionCount);

function PageA() {
  return (
    <div>
      <span data-testid="page">a</span>
      <Link to="/b">go to b</Link>
    </div>
  );
}

function PageB() {
  return (
    <div>
      <span data-testid="page">b</span>
    </div>
  );
}

function renderRouter() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <>
            <TransactionNavigationBlock />
            <PageA />
          </>
        ),
      },
      { path: "/b", element: <PageB /> },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("TransactionNavigationBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows navigation when no transaction is active", async () => {
    mockedCount.mockReturnValue(0);
    const confirmSpy = vi.spyOn(window, "confirm");
    const router = renderRouter();

    fireEvent.click(screen.getByText("go to b"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/b");
    });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("blocks navigation and stays put when the user declines the prompt", async () => {
    mockedCount.mockReturnValue(1);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const router = renderRouter();

    fireEvent.click(screen.getByText("go to b"));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(1);
    });

    // Give the blocker a tick to settle, then assert we never left page A.
    await new Promise((r) => setTimeout(r, 20));
    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByTestId("page").textContent).toBe("a");
  });

  it("allows navigation when the user confirms the prompt", async () => {
    mockedCount.mockReturnValue(1);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const router = renderRouter();

    fireEvent.click(screen.getByText("go to b"));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/b");
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });
});
