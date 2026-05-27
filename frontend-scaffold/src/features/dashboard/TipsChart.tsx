import React, { useMemo, useState } from "react";
import { BarChart2 } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Legend,
} from "recharts";

import type { Tip } from "../../types/contract";
import { useDashboardContext } from "./DashboardContext";

type View = "daily" | "weekly" | "monthly";

interface TipCountPoint {
  label: string;
  count: number;
}

interface SupporterShare {
  name: string;
  value: number;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, delta: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}

function buildDailyPoints(tips: Tip[], days: number, now: Date): TipCountPoint[] {
  const end = startOfDay(now);
  const start = addDays(end, -(days - 1));
  const byDay = new Map<string, number>();
  for (const tip of tips) {
    const tsMs = tip.timestamp < 1_000_000_000_000 ? tip.timestamp * 1000 : tip.timestamp;
    const key = startOfDay(new Date(tsMs)).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const result: TipCountPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const key = d.toISOString().slice(0, 10);
    result.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: byDay.get(key) ?? 0,
    });
  }
  return result;
}

function buildWeeklyPoints(tips: Tip[], weeks: number, now: Date): TipCountPoint[] {
  const end = startOfDay(now);
  const start = addDays(end, -7 * (weeks - 1));
  const byDay = new Map<string, number>();
  for (const tip of tips) {
    const tsMs = tip.timestamp < 1_000_000_000_000 ? tip.timestamp * 1000 : tip.timestamp;
    const key = startOfDay(new Date(tsMs)).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const result: TipCountPoint[] = [];
  for (let w = 0; w < weeks; w++) {
    const wStart = addDays(start, w * 7);
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const key = addDays(wStart, i).toISOString().slice(0, 10);
      total += byDay.get(key) ?? 0;
    }
    result.push({
      label: `Wk ${wStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      count: total,
    });
  }
  return result;
}

function buildMonthlyPoints(tips: Tip[], months: number, now: Date): TipCountPoint[] {
  const byMonth = new Map<string, number>();
  for (const tip of tips) {
    const tsMs = tip.timestamp < 1_000_000_000_000 ? tip.timestamp * 1000 : tip.timestamp;
    const d = new Date(tsMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  const result: TipCountPoint[] = [];
  const base = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  for (let i = 0; i < months; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push({
      label: d.toLocaleDateString("en-US", { month: "short" }),
      count: byMonth.get(key) ?? 0,
    });
  }
  return result;
}

function buildTopSupporters(tips: Tip[], limit = 5): SupporterShare[] {
  const counts = new Map<string, number>();
  for (const tip of tips) {
    counts.set(tip.tipper, (counts.get(tip.tipper) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([addr, value]) => ({
      name: `${addr.slice(0, 4)}…${addr.slice(-4)}`,
      value,
    }));
}

const PIE_COLORS = ["#000000", "#404040", "#666666", "#888888", "#aaaaaa"];

export interface TipsChartProps {
  tips?: Tip[];
}

const TipsChart: React.FC<TipsChartProps> = ({ tips: propTips }) => {
  const dashboard = useDashboardContext();
  const tips = propTips ?? dashboard.tips;

  const [view, setView] = useState<View>("weekly");
  const now = useMemo(() => new Date(), []);

  const barData = useMemo<TipCountPoint[]>(() => {
    if (view === "daily") return buildDailyPoints(tips, 14, now);
    if (view === "weekly") return buildWeeklyPoints(tips, 8, now);
    return buildMonthlyPoints(tips, 12, now);
  }, [tips, view, now]);

  const pieData = useMemo(() => buildTopSupporters(tips), [tips]);

  const hasTips = tips.length > 0;
  const hasBarData = barData.some((p) => p.count > 0);

  return (
    <div className="space-y-8" data-testid="tips-chart">
      {/* Bar chart – tip counts */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
              Tips received
            </p>
            <h3 className="text-xl font-black uppercase">Tip frequency</h3>
            <p className="text-sm font-bold text-gray-600">
              {hasTips ? `${tips.length} total tips` : "No tips yet"}
            </p>
          </div>
          <div className="flex border-2 border-black bg-white">
            {(["daily", "weekly", "monthly"] as const).map((v, idx, arr) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-4 py-2 text-xs font-black uppercase transition-colors ${
                  view === v ? "bg-black text-white" : "hover:bg-gray-100"
                } ${idx !== arr.length - 1 ? "border-r-2 border-black" : ""}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="border-2 border-black bg-white p-4 sm:p-6">
          {!hasBarData ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 bg-gray-50">
              <BarChart2 size={32} className="text-gray-400" />
              <p className="text-sm font-black uppercase tracking-widest text-gray-800 dark:text-gray-200">
                No data yet
              </p>
            </div>
          ) : (
            <div className="h-48 w-full" role="img" aria-label="Tips received bar chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fontWeight: 900 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10, fontWeight: 900 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value: number) => [value, "Tips"]}
                    contentStyle={{
                      border: "2px solid #000",
                      borderRadius: 0,
                      fontWeight: 900,
                    }}
                  />
                  <Bar dataKey="count" fill="#000" radius={0} isAnimationActive animationDuration={500}>
                    {barData.map((_entry, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? "#000" : "#333"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Pie chart – top supporters */}
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
            Top supporters
          </p>
          <h3 className="text-xl font-black uppercase">Supporter breakdown</h3>
        </div>

        <div className="border-2 border-black bg-white p-4 sm:p-6">
          {pieData.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 bg-gray-50">
              <BarChart2 size={32} className="text-gray-400" />
              <p className="text-sm font-black uppercase tracking-widest text-gray-800 dark:text-gray-200">
                No supporters yet
              </p>
            </div>
          ) : (
            <div className="h-48 w-full" role="img" aria-label="Top supporters pie chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    dataKey="value"
                    isAnimationActive
                    animationDuration={600}
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {pieData.map((_entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [value, "Tips"]}
                    contentStyle={{
                      border: "2px solid #000",
                      borderRadius: 0,
                      fontWeight: 900,
                    }}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs font-black uppercase">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TipsChart;
