import React from "react";
import PageContainer from "@/components/layout/PageContainer";
import Skeleton from "@/components/ui/Skeleton";

const SettingsPageSkeleton: React.FC = () => (
  <PageContainer
    maxWidth="md"
    ariaLabel="Loading settings"
    className="min-h-screen bg-gray-50 py-8"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page heading */}
      <Skeleton width="200px" height="36px" />

      {/* Section card skeleton — repeated for each settings section */}
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-lg shadow">
          <div className="p-6 border-b space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton width="20px" height="20px" variant="circle" />
              <Skeleton width="160px" height="22px" />
            </div>
            <Skeleton width="280px" height="14px" />
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton width="140px" height="14px" />
              <Skeleton width="20px" height="20px" variant="rect" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton width="120px" height="14px" />
              <Skeleton width="20px" height="20px" variant="rect" />
            </div>
          </div>
        </div>
      ))}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Skeleton height="40px" className="flex-1" />
        <Skeleton width="140px" height="40px" />
      </div>
    </div>
  </PageContainer>
);

export default SettingsPageSkeleton;
