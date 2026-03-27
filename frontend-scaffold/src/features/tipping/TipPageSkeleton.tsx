import React from "react";
import PageContainer from "../../components/layout/PageContainer";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";

const TipPageSkeleton: React.FC = () => {
  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">

        <Card className="space-y-6" padding="lg">
          <div className="flex flex-col gap-5 border-b-2 border-dashed border-black pb-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Skeleton variant="rect" width="80px" height="80px" />
              <div className="space-y-2">
                <Skeleton width="120px" height="12px" />
                <Skeleton width="180px" height="20px" />
                <Skeleton width="100px" height="12px" />
              </div>
            </div>
            <Skeleton width="60px" height="30px" />
          </div>
          <Skeleton lines={3} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton height="80px" />
            <Skeleton height="80px" />
            <Skeleton height="80px" />
          </div>
        </Card>

        <Card className="space-y-5" padding="lg">
          <div className="space-y-2">
            <Skeleton width="120px" height="12px" />
            <Skeleton width="160px" height="20px" />
          </div>
          <Skeleton height="50px" />
          <div className="flex gap-2">
            <Skeleton width="60px" height="30px" />
            <Skeleton width="60px" height="30px" />
            <Skeleton width="60px" height="30px" />
          </div>
          <Skeleton height="80px" />
          <div className="flex gap-3">
            <Skeleton height="40px" />
            <Skeleton height="40px" />
          </div>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <Skeleton width="200px" height="20px" />
          <Skeleton lines={3} />
          <Skeleton width="150px" height="12px" />
        </Card>
        
        <Card className="space-y-4">
          <Skeleton width="200px" height="20px" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height="80px" />
            ))}
          </div>
        </Card>
      </section>

    </PageContainer>
  );
};

export default TipPageSkeleton;