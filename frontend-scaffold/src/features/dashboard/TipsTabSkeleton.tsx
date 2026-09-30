import React from 'react';
import Skeleton from '@/components/ui/Skeleton';

const TipsTabSkeleton: React.FC = () => (
  <div className="space-y-5">
    {/* Export button placeholder */}
    <Skeleton variant="rect" className="h-10 w-32" />
    {/* Filter row */}
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <Skeleton variant="text" className="h-3 w-16" />
        <Skeleton variant="rect" className="h-10 w-36" />
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton variant="text" className="h-3 w-16" />
        <Skeleton variant="rect" className="h-10 w-36" />
      </div>
      <div className="flex-1 min-w-[220px]">
        <Skeleton variant="text" className="h-3 w-24 mb-1" />
        <Skeleton variant="rect" className="h-10 w-full" />
      </div>
    </div>
    {/* Row count */}
    <Skeleton variant="text" className="h-4 w-48" />
    {/* Table header */}
    <div className="flex gap-4 border-b-2 border-black pb-2">
      <Skeleton variant="text" className="h-4 w-20" />
      <Skeleton variant="text" className="h-4 w-24" />
      <Skeleton variant="text" className="h-4 w-20 ml-auto" />
      <Skeleton variant="text" className="h-4 w-24" />
    </div>
    {/* Table rows */}
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex gap-4 py-3 border-b border-gray-200">
        <Skeleton variant="text" className="h-4 w-28" />
        <Skeleton variant="text" className="h-4 w-24" />
        <Skeleton variant="text" className="h-4 w-20 ml-auto" />
        <Skeleton variant="text" className="h-4 w-32" />
      </div>
    ))}
  </div>
);

export default TipsTabSkeleton;
