import React from "react";
import PageContainer from "../../components/layout/PageContainer";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";

const LeaderboardSkeleton: React.FC = () => {
    return (
        <PageContainer maxWidth="xl" className="space-y-8 py-10">
            <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                <Card className="space-y-5 bg-yellow-100" padding="lg">
                    <Skeleton width="80px" height="10px" />
                    <div className="flex items-center gap-3">
                        <Skeleton variant="circle" width="34px" height="34px" />
                        <Skeleton width="220px" height="34px" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton lines={2} />
                    </div>
                </Card>

                <div className="grid gap-4 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="space-y-4" padding="lg">
                            <div className="flex items-center justify-between gap-3">
                                <Skeleton width="50px" height="15px" />
                                <Skeleton width="30px" height="20px" />
                            </div>
                            <div className="flex items-center gap-3">
                                <Skeleton variant="circle" width="48px" height="48px" />
                                <div className="space-y-2 flex-1">
                                    <Skeleton width="80%" height="18px" />
                                    <Skeleton width="50%" height="12px" />
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </section>

            <section>
                <Card className="space-y-6" padding="lg">
                    <div className="flex items-center justify-between">
                        <Skeleton width="180px" height="24px" />
                        <Skeleton width="150px" height="14px" />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-black text-left">
                                    <th className="px-4 py-3"><Skeleton width="40px" height="12px" /></th>
                                    <th className="px-4 py-3"><Skeleton width="100px" height="12px" /></th>
                                    <th className="px-4 py-3"><Skeleton width="80px" height="12px" /></th>
                                    <th className="px-4 py-3"><Skeleton width="60px" height="12px" /></th>
                                </tr>
                            </thead>
                            <tbody>
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <tr key={i} className="border-b border-gray-300">
                                        <td className="px-4 py-4"><Skeleton width="20px" height="14px" /></td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <Skeleton variant="circle" width="40px" height="40px" />
                                                <Skeleton width="120px" height="16px" />
                                            </div>
                                        </td>
                                        <td className="px-4 py-4"><Skeleton width="80px" height="14px" /></td>
                                        <td className="px-4 py-4"><Skeleton width="60px" height="24px" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-center">
                        <Skeleton width="240px" height="40px" />
                    </div>
                </Card>
            </section>
        </PageContainer>
    );
};

export default LeaderboardSkeleton;
