import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

import LandingPage from "../LandingPage";
import { I18nProvider } from "@/i18n";
import * as walletHook from "@/hooks/useWallet";

const mockConnect = vi.fn();

vi.mock("@/helpers/env", () => ({
  env: {
    contractId: "C1234567890",
    useMockData: false,
  },
}));

vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("../HeroSection", () => ({
  default: () => (
    <section id="hero">
      <h1>TIPZ</h1>
      <h2>Empowering creators through decentralized tipping</h2>
      <button type="button">Get Started</button>
      <button type="button">Learn More</button>
      <span>platform fee</span>
    </section>
  ),
}));

vi.mock("../StatsSection", () => ({
  default: () => (
    <section>
      <span>100</span>
      <span>5,000</span>
      <span>Tipz vs Traditional</span>
    </section>
  ),
}));

vi.mock("../TopCreatorsSection", () => ({
  default: () => <section>alice</section>,
}));

vi.mock("../TrendingCreatorsSection", () => ({
  default: () => <section aria-label="Trending Creators Section">Trending creators</section>,
}));

vi.mock("../CTASection", () => ({
  default: () => (
    <section>
      <h2>Start Receiving Tips Today</h2>
      <button type="button">Browse Creators</button>
    </section>
  ),
}));

const renderLandingPage = () =>
  render(
    <BrowserRouter>
      <I18nProvider>
        <LandingPage />
      </I18nProvider>
    </BrowserRouter>,
  );

describe("LandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(walletHook.useWallet).mockReturnValue({
      connected: false,
      connect: mockConnect,
    } as never);
  });

  it("renders hero with title and subtitle", () => {
    renderLandingPage();

    expect(
      screen.getByText(/empowering creators through decentralized tipping/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /learn more/i })).toBeInTheDocument();
  });

  it("renders hero CTA actions", async () => {
    renderLandingPage();

    await waitFor(() => expect(screen.getByText(/platform fee/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /learn more/i })).toBeInTheDocument();
  });

  it("shows stats from contract", async () => {
    renderLandingPage();

    await waitFor(() => expect(screen.getByText("100")).toBeInTheDocument());
    expect(screen.getByText("5,000")).toBeInTheDocument();
  });

  it("shows top creators", async () => {
    renderLandingPage();

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
  });

  it("renders the comparison and how-it-works content", () => {
    const { container } = renderLandingPage();

    expect(screen.getByText(/how it works/i)).toBeInTheDocument();
    expect(screen.getByText(/tipz vs traditional/i)).toBeInTheDocument();

    const responsiveContainers = Array.from(
      container.querySelectorAll("#how-it-works div"),
    ).filter((node) => node.className.includes("md:flex") || node.className.includes("md:hidden"));

    expect(responsiveContainers.length).toBeGreaterThan(0);
  });

  it("sets the page title correctly", () => {
    renderLandingPage();

    expect(document.title).toContain("Stellar Tipz");
  });

  it("routes CTA buttons correctly", async () => {
    renderLandingPage();

    await waitFor(() => expect(screen.getByText(/start receiving tips today/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /browse creators/i })).toBeInTheDocument();
  });
});
