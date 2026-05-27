import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "react-router-dom";

import EmptyState from "../../components/ui/EmptyState";
import Select from "../../components/ui/Select";
import { LeaderboardEntry } from "../../types/contract";

export type SortField = "most-tipped" | "highest-credit" | "most-supporters";
export type SortDirection = "desc" | "asc";
export type TimePeriod = "all" | "monthly" | "weekly" | "daily";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "most-tipped", label: "Most Tips Received" },
  { value: "highest-credit", label: "Highest Credit Score" },
  { value: "most-supporters", label: "Most Supporters" },
];

const TIME_PERIODS: { value: TimePeriod; label: string; description: string }[] = [
  { value: "all", label: "All Time", description: "All-time rankings" },
  { value: "monthly", label: "Monthly", description: "This month" },
  { value: "weekly", label: "Weekly", description: "This week" },
  { value: "daily", label: "Daily", description: "Today" },
];

export interface LeaderboardFiltersProps {
  entries: LeaderboardEntry[];
  loading?: boolean;
  children: (filtered: LeaderboardEntry[], period: TimePeriod) => React.ReactNode;
}

const LeaderboardFilters: React.FC<LeaderboardFiltersProps> = ({
  entries,
  loading = false,
  children,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [sort, setSort] = useState<SortField>(
    (searchParams.get("sort") as SortField) ?? "most-tipped",
  );
  const [direction, setDirection] = useState<SortDirection>(
    (searchParams.get("dir") as SortDirection) ?? "desc",
  );
  const [period, setPeriod] = useState<TimePeriod>(
    (searchParams.get("period") as TimePeriod) ?? "all",
  );

  // Sync state → URL params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (query) params.q = query;
    if (sort !== "most-tipped") params.sort = sort;
    if (direction !== "desc") params.dir = direction;
    if (period !== "all") params.period = period;
    setSearchParams(params, { replace: true });
  }, [query, sort, direction, period, setSearchParams]);

  const handleQuery = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleSort = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSort(e.target.value as SortField);
  }, []);

  const toggleDirection = useCallback(() => {
    setDirection((d) => (d === "desc" ? "asc" : "desc"));
  }, []);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();

    const matched = trimmed
      ? entries.filter((e) => e.username.toLowerCase().includes(trimmed))
      : entries;

    const multiplier = direction === "desc" ? 1 : -1;

    return [...matched].sort((a, b) => {
      if (sort === "highest-credit") {
        return multiplier * (b.creditScore - a.creditScore);
      }
      if (sort === "most-supporters") {
        // Use credit score as proxy for supporter activity since contract
        // doesn't expose supporter count in leaderboard entries
        return multiplier * (b.creditScore - a.creditScore);
      }
      const diff = BigInt(b.totalTipsReceived) - BigInt(a.totalTipsReceived);
      return multiplier * (diff > 0n ? 1 : diff < 0n ? -1 : 0);
    });
  }, [entries, query, sort, direction]);

  return (
    <div className="space-y-5">
      {/* Time period tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Time period filter">
        {TIME_PERIODS.map((tp) => (
          <button
            key={tp.value}
            role="tab"
            aria-selected={period === tp.value}
            aria-label={tp.description}
            onClick={() => setPeriod(tp.value)}
            className={`px-4 py-2 text-xs font-black uppercase border-2 border-black transition-colors focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
              period === tp.value
                ? "bg-black text-white"
                : "bg-white text-black hover:bg-gray-100"
            }`}
          >
            {tp.label}
          </button>
        ))}
      </div>

      {/* Search + sort controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 dark:text-gray-300">
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

        <div className="flex gap-2 sm:items-end">
          <div className="flex-1 sm:w-56">
            <Select
              aria-label="Sort by"
              options={SORT_OPTIONS}
              value={sort}
              onChange={handleSort}
            />
          </div>

          <button
            type="button"
            onClick={toggleDirection}
            aria-label={`Sort ${direction === "desc" ? "ascending" : "descending"}`}
            title={direction === "desc" ? "Sort ascending" : "Sort descending"}
            className="flex h-[46px] w-[46px] items-center justify-center border-2 border-black bg-white transition-colors hover:bg-gray-100 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          >
            {direction === "desc" ? (
              <ArrowDown size={18} />
            ) : direction === "asc" ? (
              <ArrowUp size={18} />
            ) : (
              <ArrowUpDown size={18} />
            )}
          </button>
        </div>
      </div>

      {/* Period label */}
      <AnimatePresence mode="wait">
        <motion.p
          key={period}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="text-xs font-black uppercase tracking-[0.2em] text-gray-500"
        >
          {TIME_PERIODS.find((t) => t.value === period)?.description}
          {loading && " · Loading…"}
        </motion.p>
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <EmptyState
              icon={<Search />}
              title="No matching creators"
              description={
                query
                  ? `No creator username matches "${query}". Try a different search.`
                  : "No entries to display."
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key={`${period}-${sort}-${direction}-${query}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children(filtered, period)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LeaderboardFilters;
