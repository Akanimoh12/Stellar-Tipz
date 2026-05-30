import React, { useState } from "react";
import { ExternalLink, PenSquare, Wallet2, UserX, Target } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import Breadcrumbs from "../../components/shared/Breadcrumbs";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ErrorState from "../../components/shared/ErrorState";
import ConfirmDialog from "../../components/shared/ConfirmDialog";
import ShareButton from "../../components/shared/ShareButton";
import { hasPositiveBalance } from "@/helpers/balance";
import { useProfile, useContract } from "../../hooks";
import { usePageTitle } from "../../hooks/usePageTitle";
import { categorizeError } from "@/helpers/error";
import { useToastStore } from "@/store/toastStore";
import { useGoalStore } from "@/store/goalStore";
import { createProfileShareData } from "@/helpers/sharing";
import Skeleton from "@/components/ui/Skeleton";

import ProfileView from "./ProfileView";
import ProfileViewSkeleton from "./ProfileViewSkeleton";
import ProfileStats, { ProfileStatsSkeleton } from "./ProfileStats";
import ActivityFeed from "./ActivityFeed";
import RegisterForm from "./RegisterForm";
import WithdrawModal from "./WithdrawModal";
import TipQRCode from "./TipQRCode";
import EmbedCodeGenerator from "./EmbedCodeGenerator";
import GoalProgress from "./GoalProgress";
import SetGoalForm from "./SetGoalForm";
import AchievementGallery from "@/features/achievements/AchievementGallery";
import { useAchievements } from "@/hooks/useAchievements";
import { logger } from "../../services/logger";

/**
 * ProfilePage is a protected route that displays the connected user's profile.
 * If the user is not registered, it prompts them to create a profile.
 * If registered, it shows their profile information, stats, activity, and actions.
 */
const ProfilePage: React.FC = () => {
  const { profile, loading, error, isRegistered, refetch } = useProfile();
  const { getStats, deregisterProfile } = useContract();
  const { addToast } = useToastStore();
  const navigate = useNavigate();
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDeregisterDialogOpen, setIsDeregisterDialogOpen] = useState(false);
  const [isDeregistering, setIsDeregistering] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const goal = useGoalStore((s) =>
    profile?.owner ? s.getCreatorGoal(profile.owner) : undefined,
  );
  const [feeBps, setFeeBps] = useState(250); // Default to 250 (2.5%) as fallback
  const { unlockedIds } = useAchievements({ tipCount: profile?.totalTipsCount ?? 0 });

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
      .catch((err) => logger.warn('features/profile/ProfilePage', 'Failed to fetch fee bps', undefined, err instanceof Error ? err : new Error(String(err))));
  }, [getStats]);

  const handleDeregister = async () => {
    if (!profile) return;
    
    setIsDeregistering(true);
    try {
      await deregisterProfile();
      addToast({
        type: "success",
        message: "Profile successfully deregistered",
        duration: 5000,
      });
      setIsDeregisterDialogOpen(false);
      // Navigate to home after successful deregistration
      navigate("/");
    } catch (err) {
      logger.error('features/profile/ProfilePage', 'Deregistration failed', undefined, err instanceof Error ? err : new Error(String(err)));
      addToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to deregister profile",
        duration: 5000,
      });
    } finally {
      setIsDeregistering(false);
    }
  };

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
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Profile' }]} />
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
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Profile' }]} />
      {/* Main Profile View Card */}
      <section aria-label="Profile summary">
        {loading ? <ProfileViewSkeleton /> : <ProfileView profile={profile} />}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          {/* Stats Section */}
          <section role="region" aria-labelledby="profile-performance-heading" className="space-y-4">
            <h2 id="profile-performance-heading" className="text-2xl font-black uppercase tracking-tight">
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
          <section role="region" aria-labelledby="recent-activity-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 id="recent-activity-heading" className="text-2xl font-black uppercase tracking-tight">
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

          {/* Fundraising Goal Section */}
          <section role="region" aria-labelledby="goal-heading" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 id="goal-heading" className="text-2xl font-black uppercase tracking-tight">
                Fundraising Goal
              </h2>
              <button
                type="button"
                onClick={() => setShowGoalForm((prev) => !prev)}
                className="text-xs font-black uppercase underline decoration-2 underline-offset-4 hover:opacity-70 transition-opacity"
              >
                {goal ? 'Edit Goal' : 'Set Goal'}
              </button>
            </div>
            {showGoalForm ? (
              <Card padding="lg" className="border-4 shadow-brutalist">
                <SetGoalForm
                  creatorAddress={profile.owner}
                  existingGoal={goal ?? null}
                  onClose={() => setShowGoalForm(false)}
                />
              </Card>
            ) : goal ? (
              <Card padding="lg" className="border-4 shadow-brutalist">
                <GoalProgress goal={goal} creatorAddress={profile.owner} showShare />
              </Card>
            ) : (
              <Card padding="lg" className="border-4 bg-gray-50 shadow-brutalist">
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <Target size={32} className="text-gray-300" />
                  <p className="text-sm font-bold text-gray-500">
                    No fundraising goal set yet
                  </p>
                  <p className="text-xs text-gray-400">
                    Set a goal to motivate your supporters and track your progress.
                  </p>
                </div>
              </Card>
            )}
          </section>

          {/* Embed Section */}
          <section role="region" aria-labelledby="share-embed-heading" className="space-y-4">
            <h2 id="share-embed-heading" className="text-2xl font-black uppercase tracking-tight">
              Share & Embed
            </h2>
            <Card padding="lg" className="border-4 shadow-brutalist">
              <EmbedCodeGenerator username={profile.username} />
            </Card>
          </section>

          {/* Achievements Section */}
          <section role="region" aria-labelledby="achievements-heading" className="space-y-4">
            <Card padding="lg" className="border-4 shadow-brutalist">
              <AchievementGallery unlockedIds={unlockedIds} />
            </Card>
          </section>
        </div>

        {/* Sidebar Actions */}
        <aside aria-label="Profile actions" className="space-y-6">
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

            <ShareButton
              type="profile"
              data={createProfileShareData(profile.username)}
              variant="button"
              size="md"
              className="w-full justify-start text-left h-14 bg-white"
            />

            <Button
              variant="outline"
              icon={<UserX size={18} />}
              className="w-full justify-start text-left h-14 bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
              onClick={() => setIsDeregisterDialogOpen(true)}
              disabled={hasPositiveBalance(profile.balance)}
            >
              Deregister Profile
            </Button>
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

      <ConfirmDialog
        isOpen={isDeregisterDialogOpen}
        onClose={() => setIsDeregisterDialogOpen(false)}
        onConfirm={handleDeregister}
        title="Deregister Profile"
        message={`Are you sure you want to permanently delete your profile "@${profile.username}"? This action cannot be undone.`}
        confirmText="Deregister Profile"
        cancelText="Keep Profile"
        requireTyping={profile.username}
        loading={isDeregistering}
        consequences={[
          "Your profile will be permanently deleted",
          "All your profile data will be removed from the platform",
          "Your username will become available for others to use",
          "You will be removed from the leaderboard",
          "You cannot recover your profile after deregistration"
        ]}
      />
    </PageContainer>
  );
};

export default ProfilePage;
