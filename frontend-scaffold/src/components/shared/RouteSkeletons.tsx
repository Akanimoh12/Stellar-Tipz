import React from "react";
import PageContainer from "@/components/layout/PageContainer";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import TipPageSkeleton from "@/features/tipping/TipPageSkeleton";
import ProfileViewSkeleton from "@/features/profile/ProfileViewSkeleton";

/**
 * Route-shaped Suspense fallbacks (#1337). Each one mirrors the layout of the
 * route it stands in for so the chunk swap-in does not shift content, instead
 * of flashing a generic centered spinner.
 */

interface ShellProps {
  label: string;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}

const SkeletonShell: React.FC<ShellProps> = ({ label, maxWidth = "xl", children }) => (
  <PageContainer
    maxWidth={maxWidth}
    className="space-y-8 py-10"
    role="status"
    aria-label={label}
    aria-live="polite"
    aria-busy="true"
    data-testid="route-skeleton"
  >
    {children}
  </PageContainer>
);

const Heading: React.FC = () => (
  <div className="space-y-2">
    <Skeleton variant="text" width="240px" height="32px" />
    <Skeleton variant="text" width="360px" height="16px" />
  </div>
);

export const TipRouteSkeleton = TipPageSkeleton;

export const ProfileRouteSkeleton: React.FC = () => (
  <SkeletonShell label="Loading profile">
    <ProfileViewSkeleton />
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3">
        <Skeleton width="160px" height="20px" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height="56px" />
        ))}
      </Card>
      <Card className="space-y-3">
        <Skeleton width="160px" height="20px" />
        <Skeleton height="180px" />
      </Card>
    </div>
  </SkeletonShell>
);

export const DashboardRouteSkeleton: React.FC = () => (
  <SkeletonShell label="Loading dashboard">
    <Heading />
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="space-y-2">
          <Skeleton width="80px" height="12px" />
          <Skeleton width="120px" height="28px" />
        </Card>
      ))}
    </div>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <Skeleton height="260px" />
      </Card>
      <Card className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height="48px" />
        ))}
      </Card>
    </div>
  </SkeletonShell>
);

export const ListRouteSkeleton: React.FC<{ label?: string }> = ({
  label = "Loading list",
}) => (
  <SkeletonShell label={label} maxWidth="lg">
    <Heading />
    <div className="flex gap-2">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} width="90px" height="36px" />
      ))}
    </div>
    <Card className="space-y-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton variant="circle" width="40px" height="40px" />
          <div className="flex-1 space-y-2">
            <Skeleton variant="text" width="40%" height="14px" />
            <Skeleton variant="text" width="25%" height="12px" />
          </div>
          <Skeleton width="80px" height="20px" />
        </div>
      ))}
    </Card>
  </SkeletonShell>
);

export const FormRouteSkeleton: React.FC<{ label?: string }> = ({
  label = "Loading form",
}) => (
  <SkeletonShell label={label} maxWidth="md">
    <Heading />
    <Card className="space-y-5" padding="lg">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton variant="text" width="120px" height="12px" />
          <Skeleton height="44px" />
        </div>
      ))}
      <Skeleton width="160px" height="44px" />
    </Card>
  </SkeletonShell>
);

export const ContentRouteSkeleton: React.FC<{ label?: string }> = ({
  label = "Loading page",
}) => (
  <SkeletonShell label={label}>
    <div className="space-y-4 py-8">
      <Skeleton variant="text" width="60%" height="48px" />
      <Skeleton variant="text" width="45%" height="20px" />
      <div className="flex gap-3 pt-2">
        <Skeleton width="160px" height="48px" />
        <Skeleton width="160px" height="48px" />
      </div>
    </div>
    <div className="grid gap-6 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="space-y-3">
          <Skeleton variant="circle" width="48px" height="48px" />
          <Skeleton variant="text" width="70%" height="18px" />
          <Skeleton variant="text" width="100%" height="14px" />
          <Skeleton variant="text" width="85%" height="14px" />
        </Card>
      ))}
    </div>
  </SkeletonShell>
);

/** Minimal fallback for the chrome-less embed widget. */
export const EmbedRouteSkeleton: React.FC = () => (
  <div role="status" aria-label="Loading widget" aria-busy="true" className="p-4 space-y-3">
    <div className="flex items-center gap-3">
      <Skeleton variant="circle" width="40px" height="40px" />
      <Skeleton variant="text" width="140px" height="16px" />
    </div>
    <Skeleton height="40px" />
  </div>
);
