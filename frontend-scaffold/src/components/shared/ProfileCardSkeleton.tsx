/** @jsxImportSource react */
import React from "react";
import Skeleton from "@/components/ui/Skeleton";

interface ProfileCardSkeletonProps {
  variant?: "compact" | "default";
}

const ProfileCardSkeleton: React.FC<ProfileCardSkeletonProps> = ({
  variant = "default",
}) => {
  if (variant === "compact") {
    return (
      <div className="flex-shrink-0 w-64 border-3 border-black bg-white p-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="circle" width={40} height={40} />
          <div className="flex-1">
            <Skeleton variant="text" width="60%" height={16} className="mb-1" />
            <Skeleton variant="text" width="40%" height={12} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-3 border-black bg-white p-6">
      <div className="flex flex-col items-center text-center">
        <Skeleton variant="circle" width={80} height={80} className="mb-4" />
        <Skeleton variant="text" width="80%" height={20} className="mb-2" />
        <Skeleton variant="text" width="60%" height={16} className="mb-4" />
        <div className="w-full space-y-2">
          <Skeleton variant="text" width="100%" height={14} />
          <Skeleton variant="text" width="80%" height={14} />
        </div>
      </div>
    </div>
  );
};

export default ProfileCardSkeleton;
