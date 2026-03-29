import React from 'react';
import { BadgeTier } from '@/helpers/badge';

interface BadgeProps {
  tier: BadgeTier;
  score?: number;
  className?: string;
}

const tierConfig: Record<string, { label: string; emoji: string; bg: string }> = {
  bronze: { label: 'Bronze', emoji: '🥉', bg: 'bg-orange-100' },
  silver: { label: 'Silver', emoji: '🥈', bg: 'bg-gray-100' },
  gold: { label: 'Gold', emoji: '🥇', bg: 'bg-yellow-100' },
  diamond: { label: 'Diamond', emoji: '💎', bg: 'bg-blue-100' },
};

const Badge: React.FC<BadgeProps> = ({ tier, score, className = '' }) => {
  const config = tierConfig[tier];

  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 border-2 border-black text-sm font-bold uppercase ${config.bg} ${className}`}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
      {score !== undefined && <span className="text-xs ml-1">({score})</span>}
    </span>
  );
};

export default Badge;
