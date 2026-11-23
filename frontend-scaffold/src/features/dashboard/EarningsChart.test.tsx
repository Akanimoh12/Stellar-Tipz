import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import EarningsChart from "./EarningsChart";

vi.mock("./DashboardContext", () => ({
  useDashboardContext: () => ({ tips: [] }),
}));

describe("EarningsChart", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders chart with tip data", () => {
    const today = new Date().toISOString().slice(0, 10);
    const earnings = [
      { date: today, amount: 100 },
    ];
    render(<EarningsChart earningsData={earnings} />);
    expect(screen.getByTestId("earnings-chart")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /earnings by weekly/i })).toBeInTheDocument();
  });

  it("toggles between time periods", async () => {
    const user = userEvent.setup();
    render(<EarningsChart earningsData={[]} />);
    const periods = screen.getByRole("group", { name: "Earnings chart time period" });
    const daily = screen.getByRole("button", { name: "Daily" });
    const weekly = screen.getByRole("button", { name: "Weekly" });

    expect(weekly).toHaveAttribute("aria-pressed", "true");
    await user.tab();
    expect(daily).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(daily).toHaveAttribute("aria-pressed", "true");
    expect(weekly).toHaveAttribute("aria-pressed", "false");
    expect(periods).toBeInTheDocument();
  });

  it("shows empty state when no data", () => {
    const earnings: Array<{ date: string; amount: number }> = [];
    render(<EarningsChart earningsData={earnings} />);
    expect(screen.getByText(/no earnings yet/i)).toBeInTheDocument();
  });
});
