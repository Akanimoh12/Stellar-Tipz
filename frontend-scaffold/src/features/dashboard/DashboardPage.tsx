import React from "react";
import { Bell, LayoutDashboard, Wallet, X } from "lucide-react";
import { Link } from "react-router-dom";

import PageContainer from "@/components/layout/PageContainer";
import ErrorState from "@/components/shared/ErrorState";
import WalletConnect from "@/components/shared/WalletConnect";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Tabs from "@/components/ui/Tabs";
import { categorizeError } from "@/helpers/error";
import { useDashboard } from "@/hooks/useDashboard";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useTipNotifications } from "@/hooks/useTipNotifications";
import { useWalletStore } from "@/store/walletStore";
import { stroopToXlm } from "@/helpers/format";
import TipQRCode from "@/features/profile/TipQRCode";
import Skeleton from "@/components/ui/Skeleton";
import DashboardStatsSkeleton from "./DashboardStatsSkeleton";
import EarningsChart from "./EarningsChart";

import EarningsTab from "./EarningsTab";
import OverviewTab from "./OverviewTab";
import SettingsTab from "./SettingsTab";
import TipsTab from "./TipsTab";
import FavoritesList from "./FavoritesList";
import { DashboardProvider } from "./DashboardContext";

const DashboardPage: React.FC = () => {
  usePageMeta({
    title: "Dashboard",
    description: "View your creator dashboard, tips, and earnings on Stellar Tipz",
  });

  const { connected } = useWalletStore();
  const dashboard = useDashboard();
  const { profile, loading, error, refetch, tips } = dashboard;
  const { latestTip, markSeen, unseenCount } = useTipNotifications(
    profile?.owner,
  );

  if (!connected) {
    return (
      <PageContainer maxWidth="xl" className="space-y-8 py-10">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
              Creator dashboard
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase">
              <LayoutDashboard size={32} />
              Dashboard
            </h1>
          </div>
          <WalletConnect />
        </section>
        <EmptyState
          icon={<Wallet />}
          title="Connect your wallet"
          description="Connect a Stellar wallet to view your creator dashboard."
        />
      </PageContainer>
    );
  }

  if (loading && !profile) {
    return (
      <PageContainer
        maxWidth="xl"
        className="space-y-8 py-10"
        aria-busy="true"
      >
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Skeleton variant="text" width="200px" height="12px" />
            <div className="mt-2">
              <Skeleton variant="text" width="260px" height="34px" />
            </div>
          </div>
          <Skeleton variant="rect" width="220px" height="44px" />
        </section>

        <DashboardStatsSkeleton />

        <div role="status" aria-busy="true" className="border-4 border-black bg-white p-6 shadow-brutalist space-y-3">
          <Skeleton variant="text" width="180px" height="18px" />
          <Skeleton variant="text" width="90%" height="14px" />
          <Skeleton variant="text" width="80%" height="14px" />
        </div>
      </PageContainer>
    );
  }

  if (error && !profile) {
    return (
      <PageContainer maxWidth="xl" className="py-20">
        <ErrorState category={categorizeError(error).category} onRetry={refetch} />
      </PageContainer>
    );
  }

  if (!profile) {
    return (
      <PageContainer maxWidth="xl" className="space-y-8 py-10">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
              Creator dashboard
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase">
              <LayoutDashboard size={32} />
              Dashboard
            </h1>
          </div>
          <WalletConnect />
        </section>
        <EmptyState
          icon={<LayoutDashboard />}
          title="No creator profile yet"
          description="Register a profile first to unlock your dashboard and withdrawal flow."
        />
        <div className="flex justify-center">
          <Link to="/profile">
            <Button variant="primary">Register now</Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  const creator = profile;

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <div className="pt-6 space-y-8">
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <OverviewTab />
            <TipQRCode username={creator.username} />
          </div>
          <div className="border-4 border-black bg-white p-6 shadow-brutalist">
            <h3 className="text-xl font-black uppercase mb-4">Earnings History</h3>
            <EarningsChart tips={tips} />
          </div>
        </div>
      ),
    },
    {
      id: "tips",
      label: "Tips",
      content: (
        <div className="pt-6">
          <TipsTab />
        </div>
      ),
    },
    {
      id: "earnings",
      label: "Earnings",
      content: <EarningsTab />,
    },
    {
      id: "favorites",
      label: "Favorites",
      content: (
        <div className="pt-6">
          <FavoritesList />
        </div>
      ),
    },
    {
      id: "settings",
      label: "Settings",
      content: (
        <div className="pt-6">
          <SettingsTab profile={creator} />
        </div>
      ),
    },
  ];

  return (
    <DashboardProvider value={dashboard}>
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
            Creator dashboard
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase">
            <LayoutDashboard size={32} />
            Dashboard
          </h1>
          <p className="mt-2 text-sm font-bold text-gray-600">
            Welcome back,{" "}
            <span className="text-black">
              {creator.displayName || `@${creator.username}`}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/profile">
            <Button variant="outline" size="sm">
              View Public Profile
            </Button>
          </Link>
          <WalletConnect />
          <p className="text-sm font-bold">@{creator.username}</p>
        </div>
      </section>

      {latestTip && unseenCount > 0 && (
        <div className="flex flex-col gap-3 border-3 border-black bg-yellow-100 p-4 shadow-brutalist sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Bell size={22} className="mt-1 shrink-0" />
            <div>
              <p className="text-sm font-black uppercase">New tip received</p>
              <p className="text-sm font-bold text-gray-700">
                {stroopToXlm(latestTip.amount)} XLM from{" "}
                {latestTip.tipper.slice(0, 6)}...{latestTip.tipper.slice(-6)}
                {latestTip.message ? ` - ${latestTip.message}` : ""}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<X size={16} />}
            onClick={markSeen}
          >
            Mark seen
          </Button>
        </div>
      )}

      <Tabs tabs={tabs} defaultTab="overview" />
    </PageContainer>
    </DashboardProvider>
  );
};

export default DashboardPage;
