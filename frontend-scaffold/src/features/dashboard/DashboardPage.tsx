import React from 'react';
import { ArrowUpRight, Coins, LayoutDashboard, Wallet } from 'lucide-react';
import { Navigate } from 'react-router-dom';

import PageContainer from "../../components/layout/PageContainer";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import TipCard from "../../components/shared/TipCard";
import WalletConnect from "../../components/shared/WalletConnect";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Pagination from "../../components/ui/Pagination";
import { mockProfile, mockTips } from "../mockData";
import DashboardSkeleton from "./DashboardSkeleton";
import EarningsChart from "./EarningsChart";
import QRCode from "./QRCode";
import TipHistory from "./TipHistory";
import { useProfile, useWallet } from "../../hooks";

const DashboardPage: React.FC = () => {
  const { connected } = useWallet();
  const { profile, loading, isRegistered } = useProfile();
  const [minTimeElapsed, setMinTimeElapsed] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const showSkeleton = (loading || !minTimeElapsed) && connected;

  if (showSkeleton) {
    return <DashboardSkeleton />;
  }

  if (!connected) {
    return <Navigate to="/" replace />;
  }

  if (!loading && !isRegistered) {
    return <Navigate to="/register" replace />;
  }

  const creator = profile ?? mockProfile;

  const tabs = [
      {
        id: 'overview',
        label: 'Overview',
        content: (
          <div className="space-y-6 pt-6">
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
              <Card className="space-y-4" padding="lg">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-2xl font-black uppercase">Recent earnings</h2>
                </div>

                {mockTips.length === 0 ? (
                  <EmptyState
                    icon={<Coins />}
                    title="No earnings yet"
                    description="Once tips start landing, your payout history will show up here."
                  />
                ) : (
                  <div className="space-y-4">
                    {mockTips.slice(0, 3).map((tip) => (
                      <TipCard key={`${tip.from}-${tip.timestamp}`} tip={tip} showReceiver={false} />
                    ))}
                  </div>
                )}
              </Card>

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
              </div>
            </section>
          </div>
        ),
      },
      {
        id: 'tips',
        label: 'Tips',
        content: <div className="pt-6"><TipHistory /></div>,
      },
      {
        id: 'earnings',
        label: 'Earnings',
        content: (
          <div className="pt-6">
            <Card>
              <p className="text-sm font-bold text-gray-700">Earnings insights module is scaffolded and ready for contract-backed analytics.</p>
            </Card>
          </div>
        ),
      },
      {
        id: 'settings',
        label: 'Settings',
        content: (
          <div className="pt-6">
            <Card>
              <p className="text-sm font-bold text-gray-700">Creator settings panel placeholder. Wallet and profile controls will land here.</p>
            </Card>
          </div>
        ),
      },
    ];

  return (
    <PageContainer maxWidth="xl" className="space-y-6 py-10">
      <section className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
            Creator dashboard
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase">
            <LayoutDashboard size={32} />
            Dashboard
          </h1>
          <p className="mt-2 text-sm font-bold text-gray-600">{creator.displayName}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Available balance</p>
          <AmountDisplay amount={mockProfile.balance} className="text-2xl" />
        </Card>
        <Card className="space-y-2 bg-yellow-100">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Lifetime volume</p>
          <AmountDisplay amount={mockProfile.totalTipsReceived} className="text-2xl" />
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Supporters</p>
          <p className="text-3xl font-black">{mockProfile.totalTipsCount}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Credit score</p>
          <CreditBadge score={mockProfile.creditScore} />
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card padding="lg">
            <EarningsChart tips={mockTips} />
          </Card>

          <Card className="space-y-4" padding="lg">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black uppercase">Recent earnings</h2>
              <Link to="/profile" className="text-sm font-black uppercase underline">
                View full profile
              </Link>
            </div>

          {mockTips.length === 0 ? (
            <EmptyState
              icon={<Coins />}
              title="No earnings yet"
              description="Once tips start landing, your payout history will show up here."
            />
          ) : (
            <div className="space-y-4">
              {mockTips.slice(0, 3).map((tip) => (
                <TipCard key={`${tip.from}-${tip.timestamp}`} tip={tip} showReceiver={false} />
              ))}
            </div>
          )}

          <Pagination currentPage={1} totalPages={totalPages} onPageChange={() => {}} />
        </Card>
      </div>

        <div className="space-y-6">
          <Card className="space-y-4" padding="lg">
            <h2 className="text-xl font-black uppercase">Withdrawal status</h2>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Ready to withdraw</p>
              <AmountDisplay amount={mockProfile.balance} className="mt-2 block text-xl" />
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
            <QRCode url={`https://tipz.app/@${mockProfile.username}`} />
          </Card>
        </div>
      </section>
    </PageContainer>
  );
};

export default DashboardPage;
