import React, { useCallback, useMemo, useState } from "react";
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
import { Tip } from "../../types/contract";
import { stroopToXlm } from "../../helpers/format";
import DashboardStatsSkeleton from "./DashboardStatsSkeleton";
import Skeleton from "@/components/ui/Skeleton";
import { useToastStore } from "@/store/toastStore";
import { useDashboardContext } from "./DashboardContext";

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
  const {
    profile,
    tips,
    stats,
    loading,
    error,
    applyOptimisticWithdrawal,
    revertOptimisticWithdrawal,
    refetch,
  } = useDashboardContext();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { addToast } = useToastStore();

  const handleWithdrawSuccess = useCallback(
    (params: { amountXlm: string; amountStroops: string; txHash: string }) => {
      applyOptimisticWithdrawal(params.amountStroops);
      addToast({
        type: "success",
        message: `Withdrawal successful: ${params.amountXlm} XLM`,
        duration: 3500,
      });
      refetch();
    },
    [addToast, applyOptimisticWithdrawal, refetch],
  );

  const handleWithdrawFailure = useCallback(() => {
    revertOptimisticWithdrawal();
  }, [revertOptimisticWithdrawal]);

  const openWithdraw = useCallback(() => {
    setWithdrawOpen(true);
  }, []);

  const closeWithdraw = useCallback(() => {
    setWithdrawOpen(false);
  }, []);

  const weeklyData = useMemo(() => buildWeeklyChart(tips), [tips]);
  const maxBar = useMemo(
    () => Math.max(...weeklyData.map((d) => d.total), 1),
    [weeklyData],
  );
  const tipLink = useMemo(
    () => (profile ? `${window.location.origin}/@${profile.username}` : ""),
    [profile],
  );
  const totalEarnedValue = useMemo(
    () => `${stroopToXlm(profile?.totalTipsReceived ?? "0")} XLM`,
    [profile],
  );
  const tipsThisWeekValue = useMemo(
    () => countThisWeek(tips).toString(),
    [tips],
  );
  const currentBalanceValue = useMemo(
    () => `${stroopToXlm(profile?.balance ?? "0")} XLM`,
    [profile],
  );
  const trendingIcon = useMemo(() => <TrendingUp size={22} />, []);
  const coinsIcon = useMemo(() => <Coins size={22} />, []);
  const balanceIcon = useMemo(() => "💰", []);
  const neutralPositiveChange = useMemo(() => ({ value: 0, positive: true }), []);

  if (loading && !profile) {
    return (
      <div className="space-y-8 py-6" aria-busy="true">
        <DashboardStatsSkeleton />

        <section role="status" aria-busy="true" className="border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between gap-4">
            <Skeleton variant="text" width="160px" height="18px" />
            <Skeleton variant="rect" width="140px" height="36px" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Skeleton variant="rect" width="100%" height="56px" />
            <Skeleton variant="rect" width="100%" height="56px" />
            <Skeleton variant="rect" width="100%" height="56px" />
            <Skeleton variant="rect" width="100%" height="56px" />
          </div>
        </section>

        <section role="status" aria-busy="true" className="border-2 border-black bg-white p-6">
          <Skeleton variant="text" width="220px" height="20px" />
          <div className="mt-4 flex h-32 items-end gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative w-full" style={{ height: "7rem" }}>
                  <Skeleton variant="rect" width="100%" height="100%" />
                </div>
                <Skeleton variant="text" width="24px" height="10px" />
              </div>
            ))}
          </div>
        </section>
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

  return (
    <div className="space-y-8">
      {/* Stats row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Earned"
          value={totalEarnedValue}
          icon={trendingIcon}
          change={neutralPositiveChange} // In future, calculate from tip delta
        />
        <StatCard
          label="Tips This Week"
          value={tipsThisWeekValue}
          icon={coinsIcon}
          change={neutralPositiveChange}
        />
        <StatCard
          label="Current Balance"
          value={currentBalanceValue}
          icon={balanceIcon}
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
        onWithdraw={openWithdraw}
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
                <span className="text-[10px] font-bold uppercase text-gray-800 dark:text-gray-200">
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
        minWithdrawal={10}
        onClose={closeWithdraw}
        onSuccess={handleWithdrawSuccess}
        onFailure={handleWithdrawFailure}
      />
    </div>
  );
};

export default OverviewTab;
