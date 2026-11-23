import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import Tabs from "../Tabs";

const tabs = [
  { id: "overview", label: "Overview", content: "Overview content" },
  { id: "tips", label: "Tips", content: "Tips content" },
  { id: "settings", label: "Settings", content: "Settings content" },
];

describe("Tabs", () => {
  it("supports arrow, Home, and End keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={tabs} defaultTab="overview" />);

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    const tipsTab = screen.getByRole("tab", { name: "Tips" });
    const settingsTab = screen.getByRole("tab", { name: "Settings" });

    overviewTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(tipsTab).toHaveFocus();
    expect(tipsTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(settingsTab).toHaveFocus();
    expect(settingsTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(overviewTab).toHaveFocus();
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
  });
});
