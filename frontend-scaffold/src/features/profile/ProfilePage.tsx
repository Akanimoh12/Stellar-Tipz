import React, { useState } from "react";
import { ExternalLink, PenSquare, Wallet2 } from "lucide-react";
import { Link } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ErrorState from "../../components/shared/ErrorState";
import { hasPositiveBalance } from "@/helpers/balance";
import { useProfile, useContract } from "../../hooks";
import { usePageTitle } from "../../hooks/usePageTitle";
import { categorizeError } from "@/helpers/error";
import Skeleton from "@/components/ui/Skeleton";

import ProfileView from "./ProfileView";
import ProfileStats, { ProfileStatsSkeleton } from "./ProfileStats";
import ActivityFeed from "./ActivityFeed";
import RegisterForm from "./RegisterForm";
import WithdrawModal from "./WithdrawModal";
import TipQRCode from "./TipQRCode";
import EmbedCodeGenerator from "./EmbedCodeGenerator";

/**
 * ProfilePage is a protected route that displays the connected user's profile.
 * If the user is not registered, it prompts them to create a profile.
 * If registered, it shows their profile information, stats, activity, and actions.
 */
const ProfilePage: React.FC = () => {
  const { profile, loading, error, isRegistered, refetch } = useProfile();
  const { getStats } = useContract();
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [feeBps, setFeeBps] = useState(250); // Default to 250 (2.5%) as fallback

  usePageTitle(
    loading
      ? "Loading Profile..."
      : isRegistered && profile
      ? `${profile.displayName} (@${profile.username})`
      : "Register Profile",
  );

  React.useEffect(() => {
    getStats()
      .then((stats) => setFeeBps(stats.feeBps))
      .catch((err) => console.error("Failed to fetch fee bps:", err));
  }, [getStats]);

  if (loading) {
    return (
      <PageContainer maxWidth="xl" className="space-y-10 py-10" aria-busy="true">
        <section role="status" aria-busy="true">
          <div className="border-4 border-black bg-white p-6 shadow-brutalist space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton variant="circle" width={72} height={72} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width="40%" height="22px" />
                <Skeleton variant="text" width="55%" height="14px" />
              </div>
              <Skeleton variant="rect" width={110} height={40} />
            </div>
            <div className="space-y-2">
              <Skeleton variant="text" width="90%" height="14px" />
              <Skeleton variant="text" width="80%" height="14px" />
              <Skeleton variant="text" width="70%" height="14px" />
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-10">
            <section className="space-y-4">
              <Skeleton variant="text" width="220px" height="24px" />
              <ProfileStatsSkeleton />
            </section>
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Skeleton variant="text" width="220px" height="24px" />
                <Skeleton variant="text" width="140px" height="16px" />
              </div>
              <Card padding="lg" className="border-4 shadow-brutalist">
                <div className="space-y-4" role="status" aria-busy="true">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Skeleton variant="circle" width={36} height={36} />
                        <div className="space-y-2">
                          <Skeleton variant="text" width="180px" height="14px" />
                          <Skeleton variant="text" width="120px" height="12px" />
                        </div>
                      </div>
                      <Skeleton variant="text" width="70px" height="14px" />
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </div>

          <aside className="space-y-6">
            <div role="status" aria-busy="true">
              <Card className="space-y-4 border-4 bg-gray-50 shadow-brutalist" padding="lg">
                <Skeleton variant="text" width="160px" height="20px" />
                <Skeleton variant="rect" width="100%" height={56} />
                <Skeleton variant="rect" width="100%" height={56} />
                <Skeleton variant="rect" width="100%" height={56} />
              </Card>
            </div>
            <div role="status" aria-busy="true">
              <Card className="border-4 bg-yellow-100 shadow-brutalist" padding="md">
                <Skeleton variant="text" width="140px" height="14px" />
                <div className="mt-2 space-y-2">
                  <Skeleton variant="text" width="100%" height="12px" />
                  <Skeleton variant="text" width="90%" height="12px" />
                </div>
              </Card>
            </div>
          </aside>
        </div>
      </PageContainer>
    );
  }

  if (error && !isRegistered) {
    return (
      <PageContainer maxWidth="xl" className="py-20">
        <ErrorState category={categorizeError(error).category} onRetry={refetch} />
      </PageContainer>
    );
  }

  // If not registered: show registration form
  if (!isRegistered) {
    return (
      <PageContainer maxWidth="xl" className="py-10">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-black uppercase">
              Create Your Profile
            </h1>
            <p className="text-gray-600 font-bold">
              Join the Stellar-Tipz community and start receiving support from
              your followers on the Stellar network.
            </p>
          </div>
          <Card padding="lg" className="border-4 shadow-brutalist">
            <RegisterForm />
          </Card>
        </div>
      </PageContainer>
    );
  }

  // If registered: show full profile view
  if (!profile) return null;

  return (
    <PageContainer maxWidth="xl" className="space-y-10 py-10">
      {/* Main Profile View Card */}
      <section>
        <ProfileView profile={profile} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          {/* Stats Section */}
          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight">
              Your Performance
            </h2>
            <ProfileStats
              balance={profile.balance}
              totalTipsReceived={profile.totalTipsReceived}
              totalTipsCount={profile.totalTipsCount}
              xFollowers={profile.xFollowers}
            />
          </section>

          {/* Activity Feed Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black uppercase tracking-tight">
                Recent Activity
              </h2>
              <Link
                to="/leaderboard"
                className="text-sm font-black uppercase underline decoration-2 underline-offset-4 hover:opacity-70 transition-opacity"
              >
                View Leaderboard
              </Link>
            </div>
            <Card padding="lg" className="border-4 shadow-brutalist">
              <ActivityFeed address={profile.owner} limit={5} />
            </Card>
          </section>

          {/* Embed Section */}
          <section className="space-y-4">
            <h2 className="text-2xl font-black uppercase tracking-tight">
              Share & Embed
            </h2>
            <Card padding="lg" className="border-4 shadow-brutalist">
              <EmbedCodeGenerator username={profile.username} />
            </Card>
          </section>
        </div>

        {/* Sidebar Actions */}
        <aside className="space-y-6">
          <TipQRCode username={profile.username} />

          <Card
            className="space-y-4 border-4 bg-gray-50 shadow-brutalist"
            padding="lg"
          >
            <h2 className="text-xl font-black uppercase tracking-tight">
              Quick Actions
            </h2>

            <Link to="/profile/edit" className="block">
              <Button
                variant="primary"
                icon={<PenSquare size={18} />}
                className="w-full justify-start text-left h-14"
              >
                Edit Profile
              </Button>
            </Link>

            <Button
              variant="outline"
              icon={<Wallet2 size={18} />}
              className="w-full justify-start text-left h-14 bg-white"
              onClick={() => setIsWithdrawModalOpen(true)}
              disabled={!hasPositiveBalance(profile.balance)}
            >
              Withdraw Tips
            </Button>

            <Link to={`/@${profile.username}`} className="block">
              <Button
                variant="outline"
                className="w-full justify-start text-left h-14 bg-white"
                iconRight={<ExternalLink size={18} />}
              >
                View Public Page
              </Button>
            </Link>
          </Card>

          <Card
            className="border-4 bg-yellow-100 shadow-brutalist"
            padding="md"
          >
            <h3 className="text-sm font-black uppercase mb-2">
              Visibility Tip
            </h3>
            <p className="text-xs font-bold leading-relaxed text-gray-800">
              Profiles with a complete bio and an X handle verification see 40%
              more tipping activity on average.
            </p>
          </Card>
        </aside>
      </div>

      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        balance={profile.balance}
        feeBps={feeBps}
      />
    </PageContainer>
  );
};

export default ProfilePage;
