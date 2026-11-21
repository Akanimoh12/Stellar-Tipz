import React from 'react';
import Skeleton from '@/components/ui/Skeleton';

const TransactionsPageSkeleton: React.FC = () => (
  <div className="space-y-5">
    {/* Tabs */}
    <div className="flex border-b-2 border-black">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} variant="rect" className="h-10 w-24 mr-1" />
      ))}
    </div>
    {/* Filters */}
    <div className="flex flex-wrap items-end gap-4">
      <Skeleton variant="rect" className="h-10 w-36" />
      <Skeleton variant="rect" className="h-10 w-36" />
    </div>
    {/* Count */}
    <Skeleton variant="text" className="h-4 w-36" />
    {/* Transaction rows */}
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-start justify-between gap-4 border-2 border-black p-4" style={{ height: 88 }}>
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" className="h-4 w-32" />
          <Skeleton variant="text" className="h-3 w-48" />
          <Skeleton variant="text" className="h-3 w-24" />
        </div>
        <div className="space-y-1 text-right">
          <Skeleton variant="text" className="h-5 w-20" />
          <Skeleton variant="text" className="h-3 w-16" />
        </div>
      </div>
    ))}
  </div>
);

export default TransactionsPageSkeleton;
