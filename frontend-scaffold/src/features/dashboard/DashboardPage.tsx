import React from "react";
import { LayoutDashboard, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

import PageContainer from "@/components/layout/PageContainer";
import ErrorState from "@/components/shared/ErrorState";
import WalletConnect from "@/components/shared/WalletConnect";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import Tabs from "@/components/ui/Tabs";
import { categorizeError } from "@/helpers/error";
import { useDashboard } from "@/hooks/useDashboard";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useWalletStore } from "@/store/walletStore";

import EarningsTab from "./EarningsTab";
import OverviewTab from "./OverviewTab";
import SettingsTab from "./SettingsTab";
import TipsTab from "./TipsTab";

const DashboardPage: React.FC = () => {
  usePageTitle("Dashboard");

  const { connected } = useWalletStore();
  const { profile, tips, loading, error, refetch } = useDashboard();

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
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-10"
      >
        <Loader size="lg" text="Loading dashboard data..." />
      </PageContainer>
    );
  }

  if (error && !profile) {
    return (
      <PageContainer maxWidth="xl" className="py-20">
        <ErrorState category={categorizeError(error)} onRetry={refetch} />
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
        <div className="pt-6">
          <OverviewTab profile={creator} tips={tips} />
        </div>
      ),
    },
    {
      id: "tips",
      label: "Tips",
      content: (
        <div className="pt-6">
          <TipsTab tips={tips} />
        </div>
      ),
    },
    {
      id: "earnings",
      label: "Earnings",
      content: <EarningsTab />,
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

      <Tabs tabs={tabs} defaultTab="overview" />
    </PageContainer>
  );
};

export default DashboardPage;
