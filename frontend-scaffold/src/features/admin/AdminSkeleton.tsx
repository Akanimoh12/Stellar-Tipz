import React from "react";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Skeleton for the tab content area of the admin dashboard while a tab's
 * data is loading.
 */
const AdminSkeleton: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    aria-label="Loading admin content"
    className="space-y-6"
  >
    {/* Section heading */}
    <Skeleton width="220px" height="24px" />

    {/* Stat cards row */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton width="100px" height="12px" />
            <Skeleton width="32px" height="32px" variant="circle" />
          </div>
          <Skeleton width="80px" height="28px" />
        </div>
      ))}
    </div>

    {/* Detail panel */}
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <Skeleton width="160px" height="18px" />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton width="100px" height="12px" />
          <Skeleton width="80px" height="28px" />
        </div>
        <div className="space-y-2">
          <Skeleton width="120px" height="12px" />
          <Skeleton width="80px" height="28px" />
        </div>
      </div>
    </div>

    {/* Activity rows */}
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <Skeleton width="140px" height="18px" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between">
          <Skeleton width="140px" height="14px" />
          <Skeleton width="80px" height="14px" />
        </div>
      ))}
    </div>
  </div>
);

export default AdminSkeleton;
