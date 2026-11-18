import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import LeaderboardFilters from "../LeaderboardFilters";
import type { LeaderboardEntry } from "../../../types/contract";

const entries: LeaderboardEntry[] = [
  { address: "G1", username: "alice", totalTipsReceived: "100", creditScore: 900 },
  { address: "G2", username: "bob", totalTipsReceived: "300", creditScore: 500 },
  { address: "G3", username: "carol", totalTipsReceived: "200", creditScore: 700 },
];

function renderFilters(initialEntry = "/leaderboard") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LeaderboardFilters entries={entries}>
        {(filtered) => (
          <ul data-testid="results">
            {filtered.map((e) => (
              <li key={e.address}>{e.username}</li>
            ))}
          </ul>
        )}
      </LeaderboardFilters>
    </MemoryRouter>,
  );
}

const renderedUsernames = () =>
  Array.from(screen.getByTestId("results").querySelectorAll("li")).map(
    (li) => li.textContent,
  );

describe("LeaderboardFilters", () => {
  it("sorts by most tips received (descending) by default", () => {
    renderFilters();
    expect(renderedUsernames()).toEqual(["bob", "carol", "alice"]);
  });

  it("filters entries by username search", async () => {
    renderFilters();

    fireEvent.change(screen.getByLabelText("Search creators"), {
      target: { value: "car" },
    });

    await waitFor(() => {
      expect(renderedUsernames()).toEqual(["carol"]);
    });
  });

  it("shows an empty state when nothing matches", async () => {
    renderFilters();

    fireEvent.change(screen.getByLabelText("Search creators"), {
      target: { value: "zzz" },
    });

    await waitFor(() => {
      expect(screen.getByText("No matching creators")).toBeInTheDocument();
    });
  });

  it("reads the initial sort field from the URL", () => {
    renderFilters("/leaderboard?sort=highest-credit");
    expect(renderedUsernames()).toEqual(["alice", "carol", "bob"]);
  });

  it("reads the initial sort direction from the URL", () => {
    renderFilters("/leaderboard?dir=asc");
    expect(renderedUsernames()).toEqual(["alice", "carol", "bob"]);
  });
});
