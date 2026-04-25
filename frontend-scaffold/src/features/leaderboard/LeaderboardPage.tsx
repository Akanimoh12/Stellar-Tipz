import React from "react";
import { Crown, Medal, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import Avatar from "../../components/ui/Avatar";
import Card from "../../components/ui/Card";
import VirtualList from "../../components/shared/VirtualList";
import ErrorState from "../../components/shared/ErrorState";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { categorizeError } from "@/helpers/error";
import LeaderboardSkeleton from "./LeaderboardSkeleton";
import { LeaderboardEntry, LeaderboardPeriod } from "@/types/contract";


const PAGE_SIZE = 5;

const LeaderboardPage: React.FC = () => {
  usePageTitle('Leaderboard');

  const [period, setPeriod] = useState<LeaderboardPeriod>('AllTime');
  const { entries, loading, error, refetch } = useLeaderboard(period);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);

  const visibleEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return entries.slice(startIndex, startIndex + PAGE_SIZE);
  }, [entries, currentPage]);

  if (loading && entries.length === 0 && !error) {
    return <LeaderboardSkeleton count={PAGE_SIZE} />;
  }

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-5 bg-yellow-100" padding="lg" hover>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-600">
            Leaderboard
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="flex items-center gap-3 text-4xl font-black uppercase">
              <Trophy size={34} />
              Top creators
            </h1>
            <div className="flex bg-white border-2 border-black p-1 shadow-brutalist-sm">
              {(['AllTime', 'Monthly', 'Weekly'] as LeaderboardPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPeriod(p);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 text-xs font-black uppercase transition-colors ${
                    period === p ? 'bg-black text-white' : 'hover:bg-gray-100'
                  }`}
                >
                  {p.replace(/([A-Z])/g, ' $1').trim()}
                </button>
              ))}
            </div>
          </div>
          <p className="max-w-2xl text-base leading-7 text-gray-700">
            A real-time snapshot of creators earning the most support on Stellar Tipz {period !== 'AllTime' && `for this ${period.replace('ly', '').toLowerCase()}`}. These rankings are fetched directly from the Tipz Soroban contract.
          </p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {error ? (
            <div className="sm:col-span-3">
              <ErrorState category={categorizeError(error).category} onRetry={refetch} />
            </div>
          ) : (
            entries.slice(0, 3).map((entry: LeaderboardEntry, index: number) => {
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

      <section>
        <Card className="space-y-6" padding="lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-2xl font-black uppercase">Full rankings</h2>
            <Link to="/dashboard" className="text-sm font-black uppercase underline">
              Open your dashboard
            </Link>
          </div>

          <div className="overflow-x-auto">
            {entries.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed border-black">
                <p className="font-black uppercase text-gray-500">No creators found on the leaderboard yet.</p>
              </div>
            ) : (
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
                  {visibleEntries.map((entry: LeaderboardEntry, index: number) => {
                    const rank = (currentPage - 1) * PAGE_SIZE + index + 1;

                    return (
                      <div className="grid grid-cols-[100px_1fr_150px_150px] border-b border-gray-300 hover:bg-gray-50 transition-colors h-full items-center">
                        <div className="px-4 text-sm font-black">{rank}</div>
                        <div className="px-4">
                          <Link to={`/@${entry.username}`} className="flex items-center gap-3 w-max">
                            <Avatar address={entry.address} alt={entry.username} fallback={entry.username} size="md" />
                            <span className="font-black uppercase">{entry.username}</span>
                          </Link>
                        </div>
                        <div className="px-4">
                          <AmountDisplay amount={entry.totalTipsReceived} className="text-sm" />
                        </div>
                        <div className="px-4">
                          <CreditBadge score={entry.creditScore} />
                        </div>
                      </div>
                    );
                  }}
                />
              </div>
            )}
          </div>
        </Card>
      </section>
    </PageContainer>
  );
};

export default LeaderboardPage;
