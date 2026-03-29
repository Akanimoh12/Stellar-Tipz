import React, { useState, useMemo, useCallback } from "react";
import { Search } from "lucide-react";

import EmptyState from "../../components/ui/EmptyState";
import Select from "../../components/ui/Select";
import { LeaderboardEntry } from "../../types/contract";

export type SortOption = "most-tipped" | "highest-credit";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "most-tipped", label: "Most Tipped" },
  { value: "highest-credit", label: "Highest Credit Score" },
];

export interface LeaderboardFilterProps {
  /**
   * The full list of leaderboard entries to filter and sort.
   * Caller is responsible for providing the slice they want filtered
   * (e.g. all entries, or rank 4+ only).
   */
  entries: LeaderboardEntry[];
  /**
   * Render prop receives the filtered+sorted subset so the parent can
   * render it however it likes (e.g. inside LeaderboardTable).
   */
  children: (filtered: LeaderboardEntry[]) => React.ReactNode;
}

const LeaderboardFilter: React.FC<LeaderboardFilterProps> = ({
  entries,
  children,
}) => {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("most-tipped");

  const handleQuery = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
    },
    [],
  );

  const handleSort = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSort(e.target.value as SortOption);
    },
    [],
  );

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();

    const matched = trimmed
      ? entries.filter((e) => e.username.toLowerCase().includes(trimmed))
      : entries;

    return [...matched].sort((a, b) => {
      if (sort === "highest-credit") {
        return b.creditScore - a.creditScore;
      }
      // "most-tipped": sort descending by totalTipsReceived (i128 as string)
      const diff =
        BigInt(b.totalTipsReceived) - BigInt(a.totalTipsReceived);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
  }, [entries, query, sort]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Search */}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={16} />
          </span>
          <input
            type="search"
            value={query}
            onChange={handleQuery}
            placeholder="Search by username…"
            aria-label="Search creators"
            className="w-full border-2 border-black bg-white py-3 pl-9 pr-4 font-medium text-black placeholder-gray-400 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          />
        </div>

        {/* Sort */}
        <div className="sm:w-56">
          <Select
            aria-label="Sort order"
            options={SORT_OPTIONS}
            value={sort}
            onChange={handleSort}
          />
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No matching creators"
          description={
            query
              ? `No creator username matches "${query}". Try a different search.`
              : "No entries to display."
          }
        />
      ) : (
        children(filtered)
      )}
    </div>
  );
};

export default LeaderboardFilter;
