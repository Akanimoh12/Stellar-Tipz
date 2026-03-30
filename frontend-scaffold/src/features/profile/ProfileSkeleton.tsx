import React from "react";
import PageContainer from "../../components/layout/PageContainer";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";

const ProfileSkeleton: React.FC = () => {
  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-6" padding="lg">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-4">
              <Skeleton variant="circle" width="80px" height="80px" />
              <div className="space-y-2">
                <Skeleton width="120px" height="12px" />
                <Skeleton width="200px" height="24px" />
                <Skeleton width="100px" height="14px" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Skeleton width="80px" height="30px" />
              <Skeleton width="140px" height="40px" />
            </div>
          </div>

          <div className="space-y-3">
            <Skeleton lines={3} />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Skeleton width="120px" height="16px" />
            <Skeleton width="150px" height="16px" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border-2 border-black bg-white p-4 space-y-2">
                <Skeleton width="60px" height="10px" />
                <Skeleton width="100px" height="20px" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4" padding="lg">
          <Skeleton width="120px" height="20px" />
          <Skeleton height="45px" />
          <Skeleton height="45px" />
          <Skeleton height="45px" />
          <div className="space-y-2">
            <Skeleton lines={2} />
          </div>
        </Card>
      </section>

      <section>
        <Card className="space-y-5" padding="lg">
          <div className="flex items-center justify-between gap-4">
            <Skeleton width="150px" height="24px" />
            <Skeleton width="180px" height="14px" />
          </div>

          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height="100px" />
            ))}
          </div>
        </Card>
      </section>
    </PageContainer>
  );
};

export default ProfileSkeleton;
