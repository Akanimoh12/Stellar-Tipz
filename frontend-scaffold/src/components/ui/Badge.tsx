import React, { useState } from 'react';
import { BadgeTier } from '@/helpers/badge';

interface BadgeProps {
  tier: BadgeTier;
  score?: number;
  className?: string;
}

const tierConfig: Record<BadgeTier, { 
  label: string; 
  emoji: string; 
  bg: string;
  text: string;
  border: string;
}> = {
  new: { 
    label: 'New', 
    emoji: '⭐', 
    bg: 'bg-gray-400', 
    text: 'text-white',
    border: 'border-gray-600'
  },
  bronze: { 
    label: 'Bronze', 
    emoji: '🥉', 
    bg: 'bg-orange-600', 
    text: 'text-white',
    border: 'border-orange-800'
  },
  silver: { 
    label: 'Silver', 
    emoji: '🥈', 
    bg: 'bg-gray-300', 
    text: 'text-black',
    border: 'border-gray-500'
  },
  gold: { 
    label: 'Gold', 
    emoji: '🥇', 
    bg: 'bg-yellow-400', 
    text: 'text-black',
    border: 'border-yellow-600'
  },
  diamond: { 
    label: 'Diamond', 
    emoji: '💎', 
    bg: 'bg-blue-200', 
    text: 'text-black',
    border: 'border-blue-400'
  },
};

const Badge: React.FC<BadgeProps> = ({ tier, score, className = '' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const config = tierConfig[tier];

  return (
    <div className="relative inline-block">
      <span
        className={`inline-flex items-center gap-1 border-2 px-3 py-1 text-sm font-bold uppercase transition-all duration-200 hover:scale-105 ${config.bg} ${config.text} ${config.border} ${className}`}
        onMouseEnter={() => score !== undefined && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{ boxShadow: '2px 2px 0px 0px rgba(0,0,0,0.3)' }}
      >
        <span>{config.emoji}</span>
        <span>{config.label}</span>
      </span>
      
      {showTooltip && score !== undefined && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs font-medium rounded whitespace-nowrap z-10">
          Score: {score}/100
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black"></div>
        </div>
      )}
    </div>
  );
};

export default Badge;