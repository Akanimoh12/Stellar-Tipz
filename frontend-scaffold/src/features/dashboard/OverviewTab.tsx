import React, { useState } from "react";
import {
  TrendingUp,
  Coins,
} from "lucide-react";

import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import TipCard from "../../components/shared/TipCard";
import { StatCard } from "../../components/ui/StartCard";
import EmptyState from "../../components/ui/EmptyState";
import { mockProfile, mockTips } from "../mockData";
import QuickActions from "./QuickActions";
import WithdrawModal from "./WithdrawModal";

// Build a simple 7-day bar chart dataset from mock tips
function buildWeeklyChart(tips: typeof mockTips) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      total: 0,
    };
  });

  const now = Date.now();
  tips.forEach((tip) => {
    const daysAgo = Math.floor((now - tip.timestamp) / (1000 * 60 * 60 * 24));
    const idx = 6 - daysAgo;
    if (idx >= 0 && idx < 7) {
      days[idx].total += Number(tip.amount);
    }
  });

  return days;
}

// Weekly tips count (tips received in the past 7 days)
function countThisWeek(tips: typeof mockTips) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return tips.filter((t) => t.timestamp >= cutoff).length;
}

// Stroop → display XLM string (no BigNumber dep needed here)
function stroopsToDisplay(stroops: string): string {
  const xlm = Number(stroops) / 1e7;
  return xlm.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const OverviewTab: React.FC = () => {
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const weeklyData = buildWeeklyChart(mockTips);
  const maxBar = Math.max(...weeklyData.map((d) => d.total), 1);
  const tipLink = `${window.location.origin}/@${mockProfile.username}`;

  return (
    <div className="space-y-8">
      {/* Stats row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Earned"
          value={`${stroopsToDisplay(mockProfile.totalTipsReceived)} XLM`}
          icon={<TrendingUp size={22} />}
          change={{ value: 14, positive: true }}
        />
        <StatCard
          label="Tips This Week"
          value={countThisWeek(mockTips)}
          icon={<Coins size={22} />}
          change={{ value: 8, positive: true }}
        />
        <StatCard
          label="Current Balance"
          value={`${stroopsToDisplay(mockProfile.balance)} XLM`}
          icon="💰"
        />
        <div className="flex flex-col gap-2 border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-sm font-mono font-bold uppercase tracking-[3px] text-zinc-500">
            Credit Score
          </p>
          <div className="mt-1">
            <CreditBadge score={mockProfile.creditScore} />
          </div>
          <p className="mt-auto text-4xl font-black">{mockProfile.creditScore}</p>
        </div>
      </section>

      {/* Quick actions */}
      <QuickActions
        balance={mockProfile.balance}
        tipLink={tipLink}
        onWithdraw={() => setWithdrawOpen(true)}
      />

      {/* Mini 7-day bar chart */}
      <section className="border-2 border-black bg-white p-6">
        <h2 className="mb-4 text-lg font-black uppercase">Tips — Last 7 Days</h2>
        <div className="flex h-32 items-end gap-2">
          {weeklyData.map((day) => {
            const heightPct = Math.round((day.total / maxBar) * 100);
            return (
              <div key={day.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative w-full" style={{ height: "7rem" }}>
                  <div
                    className="absolute bottom-0 w-full bg-black transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                    title={`${day.label}: ${day.total > 0 ? stroopsToDisplay(String(day.total)) + " XLM" : "0"}`}
                  />
                </div>
                <span className="text-[10px] font-bold uppercase text-gray-500">
                  {day.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent 5 tips */}
      <section className="space-y-3">
        <h2 className="text-lg font-black uppercase">Recent Tips</h2>
        {mockTips.length === 0 ? (
          <EmptyState
            icon={<Coins />}
            title="No tips yet"
            description="Your recent tips will appear here once they start coming in."
          />
        ) : (
          <div className="space-y-3">
            {mockTips.slice(0, 5).map((tip) => (
              <TipCard
                key={`${tip.from}-${tip.timestamp}`}
                tip={tip}
                showReceiver={false}
              />
            ))}
          </div>
        )}
        {mockTips.length > 5 && (
          <p className="text-sm font-bold text-gray-500">
            + {mockTips.length - 5} more tips — see the{" "}
            <span className="underline cursor-pointer">Tips tab</span> for full history.
          </p>
        )}
      </section>

      <WithdrawModal
        isOpen={withdrawOpen}
        balance={mockProfile.balance}
        feeBps={150}
        onClose={() => setWithdrawOpen(false)}
      />
    </div>
  );
};

export default OverviewTab;
