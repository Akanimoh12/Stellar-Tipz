import { CalendarDays, ExternalLink, PenSquare, Sparkles } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import WalletConnect from "../../components/shared/WalletConnect";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { useProfile } from "../../hooks";
import { mockProfile } from "../mockData";
import ActivityFeed from "./ActivityFeed";
import ProfileSkeleton from "./ProfileSkeleton";
import XHandleLink from "./XHandleLink";

const ProfilePage: React.FC = () => {
  const { profile, loading } = useProfile();
  const [minTimeElapsed, setMinTimeElapsed] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const showSkeleton = loading || !minTimeElapsed;

  if (showSkeleton) {
    return <ProfileSkeleton />;
  }

  const activeProfile = profile ?? mockProfile;
  const usingMockProfile = !profile;

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-6" padding="lg">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                address={activeProfile.owner}
                alt={activeProfile.displayName}
                fallback={activeProfile.displayName}
                size="xl"
              />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
                  Creator profile
                </p>
                <h1 className="text-3xl font-black uppercase">{activeProfile.displayName}</h1>
                <p className="text-sm font-bold text-gray-600">@{activeProfile.username}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <CreditBadge score={activeProfile.creditScore} />
              <WalletConnect />
            </div>
          </div>

          {usingMockProfile && (
            <div className="border-2 border-black bg-yellow-100 p-4 text-sm font-bold">
              Showing scaffold data until wallet-linked profile reads are connected.
            </div>
          )}

          <p className="max-w-3xl text-base leading-7 text-gray-700">{activeProfile.bio}</p>

          <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-gray-600">
            <span className="inline-flex items-center gap-2">
              <Sparkles size={16} />
              <XHandleLink handle={activeProfile.xHandle} followers={activeProfile.xFollowers} />
            </span>
            <span className="inline-flex items-center gap-2">
              <CalendarDays size={16} />
              Joined {new Date(activeProfile.registeredAt).toLocaleDateString()}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Balance</p>
              <AmountDisplay amount={activeProfile.balance} className="mt-2 block text-lg" />
            </div>
            <div className="border-2 border-black bg-yellow-100 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Lifetime received</p>
              <AmountDisplay amount={activeProfile.totalTipsReceived} className="mt-2 block text-lg" />
            </div>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Tips count</p>
              <p className="mt-2 text-2xl font-black">{activeProfile.totalTipsCount}</p>
            </div>
            <div className="border-2 border-black bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Followers</p>
              <p className="mt-2 text-2xl font-black">{activeProfile.xFollowers.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4" padding="lg">
          <h2 className="text-xl font-black uppercase">Next actions</h2>
          <Link to="/profile/edit" className="block">
            <Button icon={<PenSquare size={18} />} className="w-full">
              Edit profile
            </Button>
          </Link>
          <Link to={`/@${activeProfile.username}`} className="block">
            <Button variant="outline" className="w-full" iconRight={<ExternalLink size={18} />}>
              Open public tip page
            </Button>
          </Link>
          <Link to="/dashboard" className="block">
            <Button variant="outline" className="w-full">
              Review creator dashboard
            </Button>
          </Link>
          <p className="text-sm font-medium leading-6 text-gray-700">
            This page is ready for real contract-backed reads once profile fetch hooks are connected.
          </p>
        </Card>
      </section>

      <section>
        <Card className="space-y-5" padding="lg">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black uppercase">Recent tips</h2>
            <Link to="/leaderboard" className="text-sm font-black uppercase underline">
              Compare with top creators
            </Link>
          </div>

          <ActivityFeed address={activeProfile.owner} limit={4} />
        </Card>
      </section>
    </PageContainer>
  );
};

export default ProfilePage;
