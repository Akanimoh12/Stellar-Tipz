import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  Coins,
} from "lucide-react";

import CreditBadge from "../../components/shared/CreditBadge";
import { StatCard } from "../../components/ui/StartCard";
import EmptyState from "../../components/ui/EmptyState";
import ActivityMini from "./ActivityMini";
import QuickActions from "./QuickActions";
import WithdrawModal from "./WithdrawModal";
import { useDashboard } from "../../hooks/useDashboard";
import Loader from "../../components/ui/Loader";
import { Tip } from "../../types/contract";
import { stroopToXlm } from "../../helpers/format";

// Build a simple 7-day bar chart dataset from tips
function buildWeeklyChart(tips: Tip[]) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      total: 0,
    };
  });

  const now = Math.floor(Date.now() / 1000);
  tips.forEach((tip: Tip) => {
    const daysAgo = Math.floor((now - tip.timestamp) / (60 * 60 * 24));
    const idx = 6 - daysAgo;
    if (idx >= 0 && idx < 7) {
      days[idx].total += Number(tip.amount);
    }
  });

  return days;
}

// Weekly tips count (tips received in the past 7 days)
function countThisWeek(tips: Tip[]) {
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  return tips.filter((t: Tip) => t.timestamp >= cutoff).length;
}


const OverviewTab: React.FC = () => {
  const { profile, tips, stats, loading, error } = useDashboard();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  if (loading && !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader size="lg" text="Loading dashboard data..." />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="py-20">
        <EmptyState 
          title="Something went wrong" 
          description={error}
          action={{ label: "Retry", onClick: () => window.location.reload() }}
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20">
        <EmptyState 
          title="Profile not found" 
          description="It looks like you haven't registered a creator profile yet."
          action={{ label: "Create Profile", onClick: () => {} }} // Handled by dashboard tabs or modal
        />
      </div>
    );
  }

  const weeklyData = buildWeeklyChart(tips);
  const maxBar = Math.max(...weeklyData.map((d) => d.total), 1);
  const tipLink = `${window.location.origin}/@${profile.username}`;

  return (
    <div className="space-y-8">
      {/* Stats row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Earned"
          value={`${stroopToXlm(profile.totalTipsReceived)} XLM`}
          icon={<TrendingUp size={22} />}
          change={{ value: 0, positive: true }} // In future, calculate from tip delta
        />
        <StatCard
          label="Tips This Week"
          value={countThisWeek(tips).toString()}
          icon={<Coins size={22} />}
          change={{ value: 0, positive: true }}
        />
        <StatCard
          label="Current Balance"
          value={`${stroopToXlm(profile.balance)} XLM`}
          icon="💰"
        />
        <div className="flex flex-col gap-2 border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-sm font-mono font-bold uppercase tracking-[3px] text-zinc-500">
            Credit Score
          </p>
          <div className="mt-1">
            <CreditBadge score={profile.creditScore} />
          </div>
          <p className="mt-auto text-4xl font-black">{profile.creditScore}</p>
        </div>
      </section>

      {/* Quick actions */}
      <QuickActions
        balance={profile.balance}
        tipLink={tipLink}
        onWithdraw={() => setWithdrawOpen(true)}
      />

      {/* Mini 7-day bar chart */}
      <section className="border-2 border-black bg-white p-6">
        <h2 className="mb-4 text-lg font-black uppercase">Tips — Last 7 Days</h2>
        <div className="flex h-32 items-end gap-2">
          {weeklyData.map((day: { label: string; total: number }) => {
            const heightPct = Math.round((day.total / maxBar) * 100);
            return (
              <div key={day.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative w-full" style={{ height: "7rem" }}>
                  <div
                    className="absolute bottom-0 w-full bg-black transition-all duration-500"
                    style={{ height: `${heightPct}%` }}
                    title={`${day.label}: ${day.total > 0 ? stroopToXlm(String(day.total)) + " XLM" : "0"}`}
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

      {/* Mini activity feed */}
      <ActivityMini tips={tips} />

      <WithdrawModal
        isOpen={withdrawOpen}
        balance={profile.balance}
        feeBps={stats?.feeBps || 200}
        onClose={() => setWithdrawOpen(false)}
      />
    </div>
  );
};

export default OverviewTab;
