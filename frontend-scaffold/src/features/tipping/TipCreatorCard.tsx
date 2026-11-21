import type { Goal, Profile } from "@/types/contract";
import AmountDisplay from "@/components/shared/AmountDisplay";
import CreditBadge from "@/components/shared/CreditBadge";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import GoalProgress from "@/features/profile/GoalProgress";
import VerificationBadge from "@/features/profile/VerificationBadge";
import { Globe2 } from "lucide-react";

interface TipCreatorCardProps {
  creator: Profile;
  goal?: Goal;
}

const TipCreatorCard = ({ creator, goal }: TipCreatorCardProps) => (
  <Card className="space-y-6" padding="lg">
    <div className="flex flex-col gap-5 border-b-2 border-dashed border-black pb-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <Avatar
          src={creator.imageUrl || undefined}
          address={creator.owner}
          alt={creator.displayName}
          fallback={creator.displayName}
          size="xl"
          priority
        />
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-800 dark:text-gray-200">
            Tip creator
          </p>
          <h1
            id="tip-creator-heading"
            className="text-3xl font-black uppercase"
          >
            {creator.displayName}
          </h1>
          <p className="text-sm font-bold text-gray-600">@{creator.username}</p>
          <VerificationBadge
            isVerified={creator.verification?.isVerified ?? false}
            verificationType={
              creator.verification?.verificationType as
                | "Identity"
                | "SocialMedia"
                | "Community"
                | undefined
            }
            domain={creator.domain}
            domainVerified={creator.domainVerified}
            className="mt-2"
          />
          {creator.domain && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-gray-700">
              <Globe2 size={16} />
              <span>{creator.domain}</span>
              {creator.domainVerified && (
                <VerificationBadge
                  isVerified
                  domain={creator.domain}
                  domainVerified
                  className="!px-2 !py-0.5"
                />
              )}
            </div>
          )}
        </div>
      </div>
      <CreditBadge score={creator.creditScore} />
    </div>
    <p className="max-w-2xl text-base leading-7 text-gray-700">{creator.bio}</p>
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="border-2 border-black bg-yellow-100 p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
          Lifetime tips
        </p>
        <AmountDisplay
          amount={creator.totalTipsReceived}
          className="mt-2 block text-xl"
        />
      </div>
      <div className="border-2 border-black bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
          Supporters
        </p>
        <p className="mt-2 text-2xl font-black">{creator.totalTipsCount}</p>
      </div>
      <div className="border-2 border-black bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-600">
          X followers
        </p>
        <p className="mt-2 text-2xl font-black">
          {creator.xFollowers.toLocaleString()}
        </p>
      </div>
    </div>
    {goal && (
      <GoalProgress goal={goal} creatorAddress={creator.owner} showShare />
    )}
  </Card>
);

export default TipCreatorCard;
