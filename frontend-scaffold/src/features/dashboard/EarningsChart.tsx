import React from "react";
import { Coins } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { stroopToXlmBigNumber } from "../../helpers/format";
import type { Tip } from "../../types/contract";
import { useDashboardContext } from "./DashboardContext";

type View = "daily" | "weekly" | "monthly";

type EarningsDatum = { date: string; amount: number };

type ChartPoint = { label: string; value: number };

export interface EarningsChartProps {
  /**
   * Optional raw earnings data (already aggregated by date).
   * Useful for tests or if another API provides analytics directly.
   */
  earningsData?: EarningsDatum[];
  /**
   * Optional tips list (stroops + unix timestamp seconds).
   * If neither `tips` nor `earningsData` are provided, the component falls back to `useDashboard().tips`.
   */
  tips?: Tip[];
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, delta: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}

function formatDayLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekLabel(d: Date) {
  return `Wk ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function formatMonthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short" });
}

function sum(points: ChartPoint[]) {
  return points.reduce((acc, p) => acc + p.value, 0);
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function toXlmAmountFromTip(tip: Tip) {
  return Number(stroopToXlmBigNumber(tip.amount).toFixed(7));
}

function computeDaily(points: EarningsDatum[], days: number, now: Date) {
  const end = startOfDay(now);
  const start = addDays(end, -(days - 1));

  const byDay = new Map<string, number>();
  for (const p of points) {
    byDay.set(p.date, (byDay.get(p.date) ?? 0) + p.amount);
  }

  const result: ChartPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const key = d.toISOString().slice(0, 10);
    result.push({ label: formatDayLabel(d), value: byDay.get(key) ?? 0 });
  }

  return result;
}

function computeWeekly(points: EarningsDatum[], weeks: number, now: Date) {
  // Week buckets start on the day `weeks-1` weeks ago
  const end = startOfDay(now);
  const start = addDays(end, -7 * (weeks - 1));

  // Map day->amount, then roll up into 7-day windows starting at `start`
  const byDay = new Map<string, number>();
  for (const p of points) byDay.set(p.date, (byDay.get(p.date) ?? 0) + p.amount);

  const result: ChartPoint[] = [];
  for (let w = 0; w < weeks; w++) {
    const wStart = addDays(start, w * 7);
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(wStart, i);
      const key = d.toISOString().slice(0, 10);
      total += byDay.get(key) ?? 0;
    }
    result.push({ label: formatWeekLabel(wStart), value: total });
  }

  return result;
}

function computeMonthly(points: EarningsDatum[], months: number, now: Date) {
  const result: ChartPoint[] = [];
  const byMonth = new Map<string, number>(); // YYYY-MM -> amount
  for (const p of points) {
    const k = p.date.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + p.amount);
  }

  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  d.setMonth(d.getMonth() - (months - 1));

  for (let i = 0; i < months; i++) {
    const cur = new Date(d.getFullYear(), d.getMonth() + i, 1);
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    result.push({ label: formatMonthLabel(cur), value: byMonth.get(key) ?? 0 });
  }
  return result;
}

function buildEarningsFromTips(tips: Tip[]) {
  const byDay = new Map<string, number>();
  for (const tip of tips) {
    const tsMs = tip.timestamp < 1_000_000_000_000 ? tip.timestamp * 1000 : tip.timestamp;
    const d = startOfDay(new Date(tsMs));
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + toXlmAmountFromTip(tip));
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, amount]) => ({ date, amount }));
}

const EarningsChart: React.FC<EarningsChartProps> = ({ tips, earningsData }) => {
  const dashboard = useDashboardContext();
  const resolvedTips = tips ?? dashboard.tips;
  const resolvedEarnings = earningsData ?? buildEarningsFromTips(resolvedTips);

  const [view, setView] = React.useState<View>("weekly");

  const now = React.useMemo(() => new Date(), []);

  const { series, previousSeries, title } = React.useMemo(() => {
    if (view === "daily") {
      const days = 14;
      const series = computeDaily(resolvedEarnings, days, now);
      const prevNow = addDays(now, -days);
      const previousSeries = computeDaily(resolvedEarnings, days, prevNow);
      return { series, previousSeries, title: "This period" };
    }
    if (view === "weekly") {
      const weeks = 8;
      const series = computeWeekly(resolvedEarnings, weeks, now);
      const prevNow = addDays(now, -(weeks * 7));
      const previousSeries = computeWeekly(resolvedEarnings, weeks, prevNow);
      return { series, previousSeries, title: "This week" };
    }
    const months = 12;
    const series = computeMonthly(resolvedEarnings, months, now);
    const prevNow = new Date(now.getFullYear(), now.getMonth() - months, 1);
    const previousSeries = computeMonthly(resolvedEarnings, months, prevNow);
    return { series, previousSeries, title: "This month" };
  }, [resolvedEarnings, view, now]);

  const total = sum(series);
  const prevTotal = sum(previousSeries);
  const change = pctChange(total, prevTotal);
  const changePositive = change >= 0;

  const hasData = resolvedEarnings.length > 0 && series.some((p) => p.value > 0);

  return (
    <div className="space-y-5" data-testid="earnings-chart">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
            Earnings analytics
          </p>
          <h3 className="text-xl font-black uppercase">{title}</h3>
          <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
            <span className="text-black">{total.toFixed(2)} XLM</span>
            <span className={changePositive ? "text-emerald-700" : "text-red-700"}>
              {changePositive ? "+" : ""}
              {change.toFixed(0)}% vs last period
            </span>
          </div>
        </div>

        <div
          className="flex border-2 border-black bg-white"
          role="group"
          aria-label="Earnings chart time period"
        >
          {(["daily", "weekly", "monthly"] as const).map((v, idx, arr) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-4 py-2 text-xs font-black uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black ${
                view === v ? "bg-black text-white" : "hover:bg-gray-100"
              } ${idx !== arr.length - 1 ? "border-r-2 border-black" : ""}`}
            >
              {v === "daily" ? "Daily" : v === "weekly" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>

      <div className="border-2 border-black bg-white p-4 sm:p-6">
        {!hasData ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 bg-gray-50 text-gray-800 dark:text-gray-200">
            <Coins size={32} />
            <p className="text-sm font-black uppercase tracking-widest">No earnings yet</p>
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={series}
                accessibilityLayer
                aria-label="Earnings by time period"
                margin={{ top: 10, right: 10, left: -10, bottom: 10 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fontWeight: 900 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10, fontWeight: 900 }} width={44} />
                <Tooltip
                  formatter={(value: number | string) => [`${Number(value).toFixed(2)} XLM`, "Earnings"]}
                  contentStyle={{
                    border: "2px solid #000",
                    borderRadius: 0,
                    fontWeight: 900,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#000"
                  strokeWidth={3}
                  dot={false}
                  isAnimationActive
                  animationDuration={600}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {hasData && (
          <table className="sr-only">
            <caption>Earnings by {view} for the selected period</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Earnings in XLM</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.label}>
                  <th scope="row">{point.label}</th>
                  <td>{point.value.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default EarningsChart;
