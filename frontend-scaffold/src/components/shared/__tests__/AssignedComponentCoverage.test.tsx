import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreditBadge from "../CreditBadge";
import ErrorSummary from "../ErrorSummary";
import GlobalSearch from "../GlobalSearch";
import NetworkBadge from "../NetworkBadge";

const wallet = vi.hoisted(() => ({ state: { connected: true, network: "TESTNET" } }));
const search = vi.hoisted(() => ({
  state: { query: "", results: [] as any[], isLoading: false, recentSearches: [] as any[], hasSearched: false },
  setQuery: vi.fn(), addToRecent: vi.fn(), clearRecent: vi.fn(),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/store/walletStore", () => ({ useWalletStore: () => wallet.state }));
vi.mock("@/hooks/useSearch", () => ({ useSearch: () => ({ ...search.state, setQuery: search.setQuery, addToRecent: search.addToRecent, clearRecent: search.clearRecent }) }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/components/ui/Avatar", () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
vi.mock("../../ui/Tooltip", () => ({ default: ({ children, content }: { children: React.ReactNode; content: string }) => <div title={content}>{children}</div> }));
vi.mock("framer-motion", () => ({ motion: { div: "div" }, AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

beforeEach(() => {
  wallet.state = { connected: true, network: "TESTNET" };
  search.state = { query: "", results: [], isLoading: false, recentSearches: [], hasSearched: false };
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("CreditBadge (#1543)", () => {
  it("renders the score and accessible credit tooltip", () => {
    render(<MemoryRouter><CreditBadge score={75} /></MemoryRouter>);
    expect(screen.getByTitle(/Credit Score: 75\/100/)).toBeInTheDocument();
  });
  it("can hide score while keeping tier information", () => {
    render(<MemoryRouter><CreditBadge score={75} showScore={false} /></MemoryRouter>);
    expect(screen.getByTitle(/Credit Score: 75\/100/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("provides a labeled navigation link only when clickable", () => {
    render(<MemoryRouter><CreditBadge score={50} clickable /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Learn about credit scores" })).toHaveAttribute("href", "/docs/credit-score");
  });
});

describe("ErrorSummary (#1544)", () => {
  it("does not render without validation errors", () => {
    const { container } = render(<ErrorSummary errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("announces errors with an accessible alert and count", () => {
    render(<ErrorSummary errors={[{ fieldId: "email", label: "Email", message: "Required" }, { fieldId: "name", label: "Name", message: "Required" }]} />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "There are 2 problems with your submission" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Email: Required/ })).toHaveAttribute("href", "#email");
  });
  it("focuses the invalid field on activation", () => {
    const input = document.createElement("input");
    input.id = "email";
    document.body.appendChild(input);
    render(<ErrorSummary errors={[{ fieldId: "email", label: "Email", message: "Required" }]} heading="Fix email" />);
    expect(screen.getByRole("heading", { name: "Fix email" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Email/ }));
    expect(input).toHaveFocus();
    input.remove();
  });
});

describe("NetworkBadge (#1549)", () => {
  it("hides without a wallet connection", () => {
    wallet.state.connected = false;
    const { container } = render(<NetworkBadge />);
    expect(container).toBeEmptyDOMElement();
  });
  it.each([["TESTNET", "TESTNET"], ["PUBLIC", "MAINNET"], ["FUTURENET", "FUTURENET"]])("labels %s correctly", (network, label) => {
    wallet.state.network = network;
    render(<NetworkBadge />);
    expect(screen.getByText(label)).toBeVisible();
  });
});

describe("GlobalSearch (#1546)", () => {
  it("does not render when closed", () => {
    render(<GlobalSearch isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens a labeled modal, focuses the searchbox, and closes on Escape", async () => {
    const onClose = vi.fn();
    render(<GlobalSearch isOpen onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Global search" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("searchbox", { name: "Search creators" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("updates the query and clears it using the labeled button", () => {
    search.state.query = "jane";
    render(<GlobalSearch isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "smith" } });
    expect(search.setQuery).toHaveBeenCalledWith("smith");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search.setQuery).toHaveBeenCalledWith("");
  });
  it("shows accessible empty-state feedback", () => {
    search.state = { ...search.state, query: "missing", hasSearched: true };
    render(<GlobalSearch isOpen onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/No results found for "missing"/)).toBeInTheDocument();
  });
  it("can clear previous searches", () => {
    search.state.recentSearches = [{ owner: "GABC", username: "jane", displayName: "Jane" }];
    render(<GlobalSearch isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(search.clearRecent).toHaveBeenCalledOnce();
  });
});
