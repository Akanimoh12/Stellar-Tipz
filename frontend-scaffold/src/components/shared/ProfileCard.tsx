import React from 'react';
import { User, Copy, ExternalLink, Trophy, Heart } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Card from '../ui/Card';
import CreditBadge from './CreditBadge';
import AmountDisplay from './AmountDisplay';
import Skeleton from '../ui/Skeleton';
import { useFavorites } from '../../hooks/useFavorites';

interface ProfileCardProps {
  handle: string;
  publicKey: string;
  bio?: string;
  onTip?: () => void;
  variant?: 'default' | 'compact';
  creditScore?: number;
  totalTips?: string;
  streak?: number;
}

const ProfileCard: React.FC<ProfileCardProps> = ({
  handle,
  publicKey,
  bio,
  onTip,
  variant = 'default',
  creditScore,
  totalTips,
  streak,
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorite = isFavorite(publicKey);

  const shortKey = `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(publicKey);
    // Future: trigger toast
  };

  if (variant === 'compact') {
    return (
      <Card hover className="w-64 flex-shrink-0 flex flex-col gap-3" padding="sm">
        <div data-testid="profile-card" className="contents">
          <div className="flex items-center justify-between gap-2">
            <Avatar address={publicKey} alt={handle} size="md" />
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite({ address: publicKey, username: handle });
                }}
                className={`p-1.5 rounded-full transition-colors ${
                  favorite ? 'text-red-500 bg-red-50' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'
                }`}
                aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart size={18} fill={favorite ? "currentColor" : "none"} />
              </button>
              {creditScore !== undefined && (
                <CreditBadge score={creditScore} showScore={false} />
              )}
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="text-lg font-black uppercase truncate">@{handle}</h3>
            {totalTips && (
              <div className="flex items-center gap-1.5 mt-1">
                <Trophy size={14} className="text-yellow-600" />
                <AmountDisplay amount={totalTips} className="text-sm font-bold" />
              </div>
            )}
            {streak !== undefined && (
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-600">
                Streak: {streak} days
              </p>
            )}
          </div>

          <button
            onClick={onTip}
            className="w-full py-2 bg-black text-white text-xs font-black uppercase tracking-wider border-2 border-black hover:bg-gray-800 transition-colors"
          >
            View Profile
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
      <div className="h-24 bg-gradient-to-r from-blue-500 to-indigo-600 relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite({ address: publicKey, username: handle });
          }}
          className={`absolute top-4 right-4 p-2 rounded-full bg-white/20 backdrop-blur-md transition-colors ${
            favorite ? 'text-red-500' : 'text-white hover:text-red-500 hover:bg-white/40'
          }`}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart size={20} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="px-6 pb-6 text-center">
        <div className="relative -mt-12 mb-4">
          <div className="inline-flex items-center justify-center h-24 w-24 rounded-full border-4 border-white bg-gray-100 overflow-hidden shadow-sm">
            <User className="h-12 w-12 text-gray-400" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">@{handle}</h3>
        <div className="flex items-center justify-center gap-2 mb-4">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {shortKey}
            <Copy className="h-3 w-3" />
          </button>
          <a
            href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">
          {bio || "This creator hasn't added a bio yet. Support their work by sending a tip!"}
        </p>
        <button
          onClick={onTip}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-sm"
        >
          Send Tip
        </button>
      </div>
    </div>
  );
};

export default ProfileCard;

export const ProfileCardSkeleton: React.FC<{ variant?: 'default' | 'compact' }> = ({ variant = 'default' }) => {
  if (variant === 'compact') {
    return (
      <div role="status" aria-busy="true" className="w-64 flex-shrink-0">
        <Card padding="sm" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton variant="circle" width={40} height={40} />
            <Skeleton variant="text" width={28} height={20} />
          </div>
          <div className="space-y-2">
            <Skeleton variant="text" width="70%" height={18} />
            <Skeleton variant="text" width="55%" height={14} />
          </div>
          <Skeleton variant="rect" width="100%" height={36} />
        </Card>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
    >
      <div className="h-24 bg-gradient-to-r from-blue-500/20 to-indigo-600/20" />
      <div className="px-6 pb-6 text-center">
        <div className="relative -mt-12 mb-4 flex justify-center">
          <Skeleton variant="circle" width={96} height={96} className="border-4 border-white" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <Skeleton variant="text" width="55%" height={22} />
          <div className="flex items-center justify-center gap-2">
            <Skeleton variant="rect" width={140} height={28} />
            <Skeleton variant="rect" width={28} height={28} />
          </div>
        </div>
        <div className="mt-5 space-y-2">
          <Skeleton variant="text" width="90%" height={14} />
          <Skeleton variant="text" width="80%" height={14} />
          <Skeleton variant="text" width="70%" height={14} />
        </div>
        <div className="mt-6">
          <Skeleton variant="rect" width="100%" height={44} />
        </div>
      </div>
    </div>
  );
};
