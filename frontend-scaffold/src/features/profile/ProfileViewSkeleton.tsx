import React from "react";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Skeleton loading state for ProfileView component.
 * Displays placeholders for avatar, username, bio, and stats while profile data loads.
 */
const ProfileViewSkeleton: React.FC = () => {
  return (
    <div className="w-full bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Left: Avatar and Tier */}
        <div className="md:w-72 flex flex-col items-center justify-center p-8 bg-amber-400 border-b-4 md:border-b-0 md:border-r-4 border-black">
          <Skeleton variant="circle" width="120px" height="120px" />
          <div className="mt-6">
            <Skeleton variant="rect" width="100px" height="32px" />
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex-1 p-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div>
                <Skeleton variant="text" width="200px" height="36px" className="mb-2" />
                <div className="flex items-center gap-2">
                  <Skeleton variant="text" width="120px" height="20px" />
                  <Skeleton variant="circle" width="32px" height="32px" />
                </div>
              </div>
              <Skeleton variant="rect" width="140px" height="28px" />
            </div>

            <div className="space-y-2 mb-8">
              <Skeleton variant="text" width="100%" height="18px" />
              <Skeleton variant="text" width="95%" height="18px" />
              <Skeleton variant="text" width="85%" height="18px" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-6 border-t-2 border-black/5">
            <Skeleton variant="rect" width="120px" height="20px" />
            <Skeleton variant="rect" width="150px" height="20px" />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-t-4 border-black bg-white">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`p-6 ${
              i < 4 ? "border-r-4" : ""
            } ${i < 3 ? "border-t-4 md:border-t-0" : "border-t-4 md:border-t-0"} border-black`}
          >
            <Skeleton variant="text" width="80px" height="12px" className="mb-2" />
            <Skeleton variant="text" width="100px" height="28px" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProfileViewSkeleton;
