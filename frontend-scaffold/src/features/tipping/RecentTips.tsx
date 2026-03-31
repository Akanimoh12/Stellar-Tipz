import React from 'react';
import { useParams } from 'react-router-dom';

import AmountDisplay from '@/components/shared/AmountDisplay';
import EmptyState from '@/components/ui/EmptyState';
import { useTips } from '@/hooks/useTips';
import { useContract } from '@/hooks';
import { useState, useEffect } from 'react';
import Loader from '@/components/ui/Loader';

interface RecentTipsProps {
  address: string;
}

const RecentTips: React.FC<RecentTipsProps> = ({ address }) => {
  const { tips, loading } = useTips(address, "creator", 3);

  if (loading && tips.length === 0) {
    return <div className="py-10 flex justify-center"><Loader size="sm" /></div>;
  }

  if (tips.length === 0) {
    return <EmptyState title="No recent tips" description="Recent tip activity will appear here." />;
  }

  return (
    <div className="space-y-3">
      {tips.map((tip) => (
        <div key={tip.id} className="border-2 border-black p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Supporter note</p>
            <AmountDisplay amount={tip.amount} />
          </div>
          <p className="mt-3 text-sm font-medium text-gray-700">{tip.message || 'No message attached.'}</p>
        </div>
      ))}
    </div>
  );
};

export default RecentTips;
