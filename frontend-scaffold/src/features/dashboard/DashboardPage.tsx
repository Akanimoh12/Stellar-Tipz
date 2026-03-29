import React from 'react';
import { ArrowUpRight, Coins, LayoutDashboard, Wallet, QrCode, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

import PageContainer from "../../components/layout/PageContainer";
import WalletConnect from "../../components/shared/WalletConnect";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import TipCard from "../../components/shared/TipCard";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Pagination from "../../components/ui/Pagination";
import Tabs from "../../components/ui/Tabs";
import { mockProfile, mockTips } from "../mockData";
import EarningsChart from "./EarningsChart";
import QRCode from "./QRCode";
import OverviewTab from "./OverviewTab";
import TipsTab from "./TipsTab";
import { useWalletStore } from "../../store/walletStore";
import { useDashboard, usePageTitle } from "../../hooks";

const EarningsTab: React.FC<{ profile: any; stats: any; loading: boolean }> = () => (
  <div className="pt-6">
    <Card>
      <p className="text-sm font-bold text-gray-700">Earnings insights module is scaffolded and ready for contract-backed analytics.</p>
    </Card>
  </div>
);

const SettingsTab: React.FC<{ profile: any }> = () => (
  <div className="pt-6">
    <Card>
      <p className="text-sm font-bold text-gray-700">Creator settings panel placeholder. Wallet and profile controls will land here.</p>
    </Card>
  </div>
);

const DashboardPage: React.FC = () => {
  usePageTitle("Dashboard");

  const { connected } = useWalletStore();
  const { profile, tips, stats, loading } = useDashboard();

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


  const displayTips = tips && tips.length > 0 ? tips : mockTips;
  const totalPages = Math.ceil(displayTips.length / 10) || 1;
  if (!loading && !profile) {
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
          <Link to="/register">
            <Button>Register now</Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  const creator = profile ?? mockProfile;

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <div className="pt-6">
          <OverviewTab />
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
      content: (
        <div className="pt-6">
          <Card padding="lg">
            <p className="text-sm font-bold text-gray-700">
              Earnings insights and charts will appear here once contract-backed
              analytics are connected.
            </p>
          </Card>
        </div>
      ),
    },
    {
      id: "settings",
      label: "Settings",
      content: (
        <div className="pt-6">
          <SettingsTab profile={profile} />
          <Card className="space-y-4" padding="lg">
            <div className="flex items-center gap-3">
              <Settings size={22} />
              <h2 className="text-2xl font-black uppercase">
                Settings scaffold
              </h2>
            </div>
            <p className="text-sm font-medium leading-6 text-gray-700">
              Profile editing already lives in a dedicated flow. Additional
              payout and notification settings will land here as the dashboard
              evolves.
            </p>
            <Link to="/profile/edit">
              <Button variant="outline">Edit profile</Button>
            </Link>
          </Card>
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
          {profile?.displayName ? (
            <p className="mt-2 text-sm font-bold text-gray-600">
              {profile.displayName}
            </p>
          ) : null}
          <p className="mt-2 text-sm font-bold text-gray-600">
            Welcome back, <span className="text-black">{profile?.displayName || `@${creator.username}`}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/profile">
            <Button variant="outline" size="sm">View Public Profile</Button>
          </Link>
          <WalletConnect />
          <p>
            @{creator.username}
          </p>
          <WalletConnect />
        </div>
      </section>

      {/* Stats Overview */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Available balance</p>
          <AmountDisplay amount={creator.balance} className="text-2xl" />
        </Card>
        <Card className="space-y-2 bg-yellow-100">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Lifetime volume</p>
          <AmountDisplay amount={creator.totalTipsReceived} className="text-2xl" />
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Supporters</p>
          <p className="text-3xl font-black">{creator.totalTipsCount}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Credit score</p>
          <CreditBadge score={creator.creditScore} />
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card padding="lg">
            <EarningsChart tips={displayTips} />
          </Card>

          <Card className="space-y-4" padding="lg">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black uppercase">Recent earnings</h2>
              <Link to="/profile" className="text-sm font-black uppercase underline">
                View full activity
              </Link>
            </div>

            {displayTips.length === 0 ? (
              <EmptyState
                icon={<Coins />}
                title="No earnings yet"
                description="Once tips start landing, your payout history will show up here."
              />
            ) : (
              <div className="space-y-4">
                {displayTips.slice(0, 3).map((tip) => (
                  <TipCard key={`${tip.from}-${tip.timestamp}`} tip={tip} showReceiver={false} />
                ))}
              </div>
            )}

            <Pagination currentPage={1} totalPages={Math.ceil(mockTips.length / 3)} onPageChange={() => { }} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4" padding="lg">
            <h2 className="text-xl font-black uppercase">Withdrawal status</h2>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Ready to withdraw</p>
              <AmountDisplay amount={creator.balance} className="mt-2 block text-xl" />
            </div>
            <p className="text-sm font-medium leading-6 text-gray-700">
              Withdrawal execution is still placeholder-backed in the scaffold, but the dashboard now makes the flow visible.
            </p>
          </Card>

          <Card className="space-y-4" padding="lg">
            <h2 className="text-xl font-black uppercase">Growth signals</h2>
            <div className="grid gap-3">
              <div className="flex items-center justify-between border-2 border-black p-3">
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <Wallet size={16} />
                  Returning supporters
                </span>
                <span className="text-lg font-black">38%</span>
              </div>
              <div className="flex items-center justify-between border-2 border-black p-3">
                <span className="inline-flex items-center gap-2 text-sm font-bold">
                  <ArrowUpRight size={16} />
                  Weekly tip volume
                </span>
                <span className="text-lg font-black">+14%</span>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <div className="flex items-center gap-2 mb-4">
              <QrCode size={20} />
              <h2 className="text-xl font-black uppercase">QR Code</h2>
            </div>
            <QRCode url={`https://tipz.app/@${creator.username}`} />
          </Card>
        </div>
        <WalletConnect />
      </section>

      <Tabs tabs={tabs} defaultTab="overview" />
    </PageContainer>
  );
};

export default DashboardPage;
