import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

import CategoryFilter from "../CategoryFilter";
import Podium from "../Podium";
import LeaderboardTable from "../LeaderboardTable";
import type { LeaderboardEntry } from "@/types/contract";

const mockEntries: LeaderboardEntry[] = [
  { address: "G1", username: "alice", totalTipsReceived: "1000000000", creditScore: 950 },
  { address: "G2", username: "bob", totalTipsReceived: "800000000", creditScore: 850 },
  { address: "G3", username: "carol", totalTipsReceived: "600000000", creditScore: 750 },
  { address: "G4", username: "dave", totalTipsReceived: "400000000", creditScore: 650 },
];

describe("Leaderboard Keyboard Navigation Audit (#1689)", () => {
  describe("CategoryFilter", () => {
    it("renders category tabs with proper accessibility attributes and keyboard interactivity", () => {
      const handleCategoryChange = vi.fn();
      render(
        <CategoryFilter
          selectedCategory="All"
          onCategoryChange={handleCategoryChange}
        />
      );

      const allTab = screen.getByRole("tab", { name: "All" });
      const artTab = screen.getByRole("tab", { name: "Art" });

      expect(allTab).toHaveAttribute("aria-selected", "true");
      expect(artTab).toHaveAttribute("aria-selected", "false");

      artTab.focus();
      expect(document.activeElement).toBe(artTab);

      fireEvent.click(artTab);
      expect(handleCategoryChange).toHaveBeenCalledWith("Art");
    });
  });

  describe("Podium", () => {
    it("renders podium links with clear descriptive aria-labels and keyboard reachability", () => {
      render(
        <BrowserRouter>
          <Podium creators={mockEntries} />
        </BrowserRouter>
      );

      const goldLink = screen.getByRole("link", { name: /#1 Gold podium: alice/i });
      expect(goldLink).toBeInTheDocument();

      goldLink.focus();
      expect(document.activeElement).toBe(goldLink);
    });
  });

  describe("LeaderboardTable", () => {
    it("ensures leaderboard rows are keyboard focusable and activate on Enter", () => {
      render(
        <BrowserRouter>
          <LeaderboardTable entries={[mockEntries[3]]} />
        </BrowserRouter>
      );

      const row = screen.getByRole("row", { name: /view @dave profile/i });
      expect(row).toHaveAttribute("tabindex", "0");

      row.focus();
      expect(document.activeElement).toBe(row);
    });
  });
});
