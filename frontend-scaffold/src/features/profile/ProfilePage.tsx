import React, { useState } from "react";
import { ExternalLink, PenSquare, Wallet2 } from "lucide-react";
import { Link } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Loader from "../../components/ui/Loader";
import ErrorState from "../../components/shared/ErrorState";
import { useProfile } from "../../hooks";
import { usePageTitle } from "../../hooks/usePageTitle";
import { categorizeError } from "@/helpers/error";

import ProfileView from "./ProfileView";
import ProfileStats from "./ProfileStats";
import ActivityFeed from "./ActivityFeed";
import RegisterForm from "./RegisterForm";
import WithdrawModal from "./WithdrawModal";

/**
 * ProfilePage is a protected route that displays the connected user's profile.
 * If the user is not registered, it prompts them to create a profile.
 * If registered, it shows their profile information, stats, activity, and actions.
 */
const ProfilePage: React.FC = () => {
  const { profile, loading, error, isRegistered, refetch } = useProfile();
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);

  usePageTitle(
    loading
      ? "Loading Profile..."
      : isRegistered && profile
      ? `${profile.displayName} (@${profile.username})`
      : "Register Profile"
  );

  if (loading) {
    return (
      <PageContainer maxWidth="xl" className="flex items-center justify-center py-20">
        <Loader size="lg" text="Loading profile..." />
      </PageContainer>
    );
  }

  if (error && !isRegistered) {
    return (
      <PageContainer maxWidth="xl" className="py-20">
        <ErrorState 
          category={categorizeError(error)} 
          onRetry={refetch} 
        />
      </PageContainer>
    );
  }

  // If not registered: show registration form
  if (!isRegistered) {
    return (
      <PageContainer maxWidth="xl" className="py-10">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-black uppercase">Create Your Profile</h1>
            <p className="text-gray-600 font-bold">
              Join the Stellar-Tipz community and start receiving support from your followers on the Stellar network.
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
            <h2 className="text-2xl font-black uppercase tracking-tight">Your Performance</h2>
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
              <h2 className="text-2xl font-black uppercase tracking-tight">Recent Activity</h2>
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
        </div>

        {/* Sidebar Actions */}
        <aside className="space-y-6">
          <Card className="space-y-4 border-4 bg-gray-50 shadow-brutalist" padding="lg">
            <h2 className="text-xl font-black uppercase tracking-tight">Quick Actions</h2>
            
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
              disabled={parseFloat(profile.balance) <= 0}
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

          <Card className="border-4 bg-yellow-100 shadow-brutalist" padding="md">
            <h3 className="text-sm font-black uppercase mb-2">Visibility Tip</h3>
            <p className="text-xs font-bold leading-relaxed text-gray-800">
              Profiles with a complete bio and an X handle verification see 40% more tipping activity on average.
            </p>
          </Card>
        </aside>
      </div>

      {/* Withdraw Modal */}
      <WithdrawModal 
        isOpen={isWithdrawModalOpen} 
        onClose={() => setIsWithdrawModalOpen(false)} 
        balance={profile.balance} 
      />
    </PageContainer>
  );
};

export default ProfilePage;

