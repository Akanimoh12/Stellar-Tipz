import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Badge from "../Badge";
import { getTierFromScore } from "@/helpers/badge";

describe("Badge", () => {
  it.each([
    ["new", "New", "⭐"],
    ["bronze", "Bronze", "🥉"],
    ["silver", "Silver", "🥈"],
    ["gold", "Gold", "🥇"],
    ["diamond", "Diamond", "💎"],
  ] as const)("renders the %s tier with the right label and emoji", (tier, label, emoji) => {
    render(<Badge tier={tier} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(emoji)).toBeInTheDocument();
  });

  it("does not render a score tooltip when score is omitted", () => {
    render(<Badge tier="gold" />);
    expect(screen.queryByText(/Score: \d+\/100/)).toBeNull();
  });

  it("shows the score tooltip on hover when score is provided", async () => {
    const user = userEvent.setup();
    render(<Badge tier="gold" score={75} />);
    expect(screen.queryByText("Score: 75/100")).toBeNull();
    await user.hover(screen.getByText("Gold"));
    expect(screen.getByText("Score: 75/100")).toBeInTheDocument();
  });

  it("treats score=0 as a valid (not-falsy) value and shows the tooltip on hover", async () => {
    const user = userEvent.setup();
    render(<Badge tier="new" score={0} />);
    await user.hover(screen.getByText("New"));
    expect(screen.getByText("Score: 0/100")).toBeInTheDocument();
  });

  it("merges a custom className onto the badge span", () => {
    const { container } = render(<Badge tier="silver" className="ml-4" />);
    const badgeSpan = container.querySelector("span.ml-4");
    expect(badgeSpan).not.toBeNull();
  });
});

describe("getTierFromScore", () => {
  it.each([
    [0, "new"],
    [1, "bronze"],
    [400, "bronze"],
    [401, "silver"],
    [700, "silver"],
    [701, "gold"],
    [900, "gold"],
    [901, "diamond"],
    [1000, "diamond"],
    [2000, "diamond"],
  ] as const)("score %i → %s", (score, expected) => {
    expect(getTierFromScore(score)).toBe(expected);
  });

  it("accepts a numeric string and parses it", () => {
    expect(getTierFromScore("750")).toBe("gold");
  });
});
