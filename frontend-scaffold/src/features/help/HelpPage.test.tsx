import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import HelpPage from "./HelpPage";

vi.mock("@/hooks/usePageMeta", () => ({
  usePageMeta: vi.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  );

describe("Help center", () => {
  it("renders FAQ items", () => {
    renderPage();
    expect(screen.getByText(/how do i send a tip/i)).toBeInTheDocument();
  });

  it("expands FAQ on click", async () => {
    renderPage();
    await userEvent.click(screen.getByText(/how do i send a tip/i));
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
  });

  it("search filters FAQ items", async () => {
    renderPage();
    await userEvent.type(screen.getByRole("searchbox"), "wallet");
    await waitFor(() => {
      expect(screen.queryByText(/credit score/i)).not.toBeInTheDocument();
    });
  });

  it("renders all category filter buttons", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /wallet setup/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fees/i })).toBeInTheDocument();
  });

  it("filters FAQ by category", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^fees$/i }));
    expect(
      screen.getByText(/what fees does stellar tipz charge/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/how do i set up a stellar wallet/i),
    ).not.toBeInTheDocument();
  });

  it("shows empty state when search has no results", async () => {
    renderPage();
    await userEvent.type(
      screen.getByRole("searchbox"),
      "zzznomatchzzz",
    );
    await waitFor(() => {
      expect(
        screen.getByText(/no articles match your search/i),
      ).toBeInTheDocument();
    });
  });

  it("renders contact form and submits", async () => {
    renderPage();
    const nameInput = screen.getByLabelText(/name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const messageInput = screen.getByLabelText(/message/i);

    await userEvent.type(nameInput, "Alice");
    await userEvent.type(emailInput, "alice@example.com");
    await userEvent.type(messageInput, "Hello there");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(
      screen.getByText(/message received/i),
    ).toBeInTheDocument();
  });

  it("renders Discord community link", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /join stellar discord/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://discord.gg/stellardev");
  });
});
