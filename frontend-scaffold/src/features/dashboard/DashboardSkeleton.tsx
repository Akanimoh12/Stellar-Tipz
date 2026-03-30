import React from 'react';
import PageContainer from "../../components/layout/PageContainer";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";

const DashboardSkeleton: React.FC = () => {
    return (
        <PageContainer maxWidth="xl" className="space-y-6 py-10">
            <section className="flex flex-col gap-3">
                <div className="space-y-2">
                    <Skeleton width="100px" height="10px" />
                    <Skeleton width="220px" height="32px" />
                    <Skeleton width="140px" height="14px" />
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="space-y-2">
                        <Skeleton width="100px" height="10px" />
                        <Skeleton width="140px" height="24px" />
                    </Card>
                ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-6">
                    <Card padding="lg">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <Skeleton width="180px" height="24px" />
                                <Skeleton width="140px" height="32px" />
                            </div>
                            <div className="relative border-2 border-black bg-white p-6 pb-2">
                                <div className="flex h-48 items-end gap-2 md:gap-4">
                                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                                        <div key={i} className="flex flex-1 flex-col items-center">
                                            <Skeleton width="100%" height={`${Math.random() * 60 + 20}%`} />
                                            <Skeleton width="30px" height="10px" className="mt-2" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card className="space-y-4" padding="lg">
                        <div className="flex items-center justify-between gap-4">
                            <Skeleton width="180px" height="24px" />
                            <Skeleton width="120px" height="14px" />
                        </div>
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} height="80px" />
                            ))}
                        </div>
                        <Skeleton width="200px" height="30px" className="mx-auto" />
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="space-y-4" padding="lg">
                        <Skeleton width="180px" height="24px" />
                        <div className="border-2 border-black bg-white p-4 space-y-2">
                            <Skeleton width="120px" height="10px" />
                            <Skeleton width="100px" height="20px" />
                        </div>
                        <Skeleton lines={2} />
                    </Card>

                    <Card className="space-y-4" padding="lg">
                        <Skeleton width="150px" height="24px" />
                        <div className="grid gap-3">
                            <Skeleton height="50px" />
                            <Skeleton height="50px" />
                        </div>
                    </Card>
                    
                    <Card padding="lg" className="flex flex-col items-center space-y-4">
                        <div className="space-y-2 text-center">
                           <Skeleton width="80px" height="10px" className="mx-auto" />
                           <Skeleton width="120px" height="20px" className="mx-auto" />
                        </div>
                        <Skeleton width="160px" height="160px" />
                        <div className="w-full space-y-3">
                           <Skeleton height="40px" />
                           <Skeleton height="45px" />
                        </div>
                    </Card>
                </div>
            </section>
        </PageContainer>
    );
};

export default DashboardSkeleton;
