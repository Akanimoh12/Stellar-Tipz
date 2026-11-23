import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Tip } from "../../types/contract";
import TipsChart from "./TipsChart";

vi.mock("./DashboardContext", () => ({
  useDashboardContext: () => ({ tips: [] }),
}));

describe("TipsChart", () => {
  it("announces selected time periods and exposes chart data in tables", async () => {
    const user = userEvent.setup();
    const tips: Tip[] = [
      {
        id: 1,
        tipper: "GABC123456789",
        creator: "GCREATOR",
        amount: "10000000",
        message: "",
        timestamp: Math.floor(Date.now() / 1000),
      },
    ];

    render(<TipsChart tips={tips} />);

    const daily = screen.getByRole("button", { name: "Daily" });
    const weekly = screen.getByRole("button", { name: "Weekly" });
    expect(weekly).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("table", { name: /tips received by weekly/i })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Tip counts for top supporters" })).toBeInTheDocument();

    await user.tab();
    expect(daily).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(daily).toHaveAttribute("aria-pressed", "true");
    expect(weekly).toHaveAttribute("aria-pressed", "false");
  });
});
