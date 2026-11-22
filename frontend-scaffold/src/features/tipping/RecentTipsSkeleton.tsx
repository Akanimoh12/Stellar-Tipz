import React from 'react';
import Skeleton from '@/components/ui/Skeleton';

const RecentTipsSkeleton: React.FC = () => (
  <div className="space-y-3">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="border-2 border-black p-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton variant="text" className="h-3 w-24" />
          <Skeleton variant="text" className="h-5 w-20" />
        </div>
        <Skeleton variant="text" className="h-4 w-3/4 mt-3" />
      </div>
    ))}
  </div>
);

export default RecentTipsSkeleton;
