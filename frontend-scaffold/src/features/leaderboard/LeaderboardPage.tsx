import React, { useState } from "react";
import { Crown, Medal, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import Avatar from "../../components/ui/Avatar";
import Card from "../../components/ui/Card";
import Pagination from "../../components/ui/Pagination";
import ErrorState from "../../components/shared/ErrorState";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { categorizeError } from "@/helpers/error";
import LeaderboardSkeleton from "./LeaderboardSkeleton";
import LeaderboardFilters from "./LeaderboardFilters";


const PAGE_SIZE = 5;

const LeaderboardPage: React.FC = () => {
  usePageTitle('Leaderboard');

  const { entries, loading, error, refetch } = useLeaderboard();
  const [currentPage, setCurrentPage] = useState(1);

  const leaderboardAnnouncement = error
    ? `Leaderboard failed to load: ${categorizeError(error).message}`
    : entries.length === 0
    ? "Leaderboard loaded with no creators yet."
    : `Leaderboard loaded with ${entries.length} creators.`;

  if (loading && entries.length === 0 && !error) {
    return <LeaderboardSkeleton count={PAGE_SIZE} />;
  }

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <section aria-labelledby="leaderboard-heading" className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-5 bg-yellow-100" padding="lg" hover>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-600">
            Leaderboard
          </p>
          <h1 id="leaderboard-heading" className="flex items-center gap-3 text-4xl font-black uppercase">
            <Trophy size={34} />
            Top creators
          </h1>
          <p className="max-w-2xl text-base leading-7 text-gray-700">
            A real-time snapshot of creators earning the most support on Stellar Tipz. These rankings are fetched directly from the Tipz Soroban contract.
          </p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {error ? (
            <div className="sm:col-span-3">
              <ErrorState category={categorizeError(error).category} onRetry={refetch} />
            </div>
          ) : (
            entries.slice(0, 3).map((entry, index) => {
              const icons = [<Crown key="crown" size={18} />, <Medal key="silver" size={18} />, <Medal key="bronze" size={18} />];
              const labels = ["1st", "2nd", "3rd"];

              return (
                <Card key={entry.address} className="space-y-4" padding="lg" hover>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-black uppercase">
                      {icons[index]}
                      {labels[index]}
                    </span>
                    <CreditBadge score={entry.creditScore} showScore={false} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar address={entry.address} alt={entry.username} fallback={entry.username} size="lg" />
                    <div>
                      <p className="text-lg font-black uppercase truncate max-w-[120px]">{entry.username}</p>
                      <AmountDisplay amount={entry.totalTipsReceived} className="text-sm" />
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </section>

      <section role="region" aria-labelledby="full-rankings-heading">
        <Card className="space-y-6" padding="lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 id="full-rankings-heading" className="text-2xl font-black uppercase">Full rankings</h2>
            <Link to="/dashboard" className="text-sm font-black uppercase underline">
              Open your dashboard
            </Link>
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-black">
              <p className="font-black uppercase text-gray-800 dark:text-gray-200">No creators found on the leaderboard yet.</p>
            </div>
          ) : (
            <LeaderboardFilters entries={entries} loading={loading}>
              {(filtered) => {
                const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                const safePage = Math.min(currentPage, Math.max(1, totalPages));
                const visibleEntries = filtered.slice(
                  (safePage - 1) * PAGE_SIZE,
                  safePage * PAGE_SIZE,
                );

                return (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr className="border-b-2 border-black text-left">
                            <th scope="col" className="px-4 py-3 text-xs font-black uppercase tracking-[0.2em]">Rank</th>
                            <th scope="col" className="px-4 py-3 text-xs font-black uppercase tracking-[0.2em]">Creator</th>
                            <th scope="col" className="px-4 py-3 text-xs font-black uppercase tracking-[0.2em]">Volume</th>
                            <th scope="col" className="px-4 py-3 text-xs font-black uppercase tracking-[0.2em]">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleEntries.map((entry, index) => {
                            const rank = (safePage - 1) * PAGE_SIZE + index + 1;
                            return (
                              <tr key={entry.address} className="border-b border-gray-300 hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-4 text-sm font-black">{rank}</td>
                                <td className="px-4 py-4">
                                  <Link to={`/@${entry.username}`} className="flex items-center gap-3">
                                    <Avatar address={entry.address} alt={entry.username} fallback={entry.username} size="md" />
                                    <span className="font-black uppercase">{entry.username}</span>
                                  </Link>
                                </td>
                                <td className="px-4 py-4">
                                  <AmountDisplay amount={entry.totalTipsReceived} className="text-sm" />
                                </td>
                                <td className="px-4 py-4">
                                  <CreditBadge score={entry.creditScore} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <Pagination
                      currentPage={safePage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  </div>
                );
              }}
            </LeaderboardFilters>
          )}
        </Card>
      </section>

      <div role="status" aria-live="polite" className="sr-only">
        {leaderboardAnnouncement}
      </div>
    </PageContainer>
  );
};

export default LeaderboardPage;
