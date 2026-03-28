import React, { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import Avatar from "../../components/ui/Avatar";
import Card from "../../components/ui/Card";
import Pagination from "../../components/ui/Pagination";
import { mockLeaderboard } from "../mockData";
import { usePageTitle } from "@/hooks/usePageTitle";
import Podium from "./Podium";

const PAGE_SIZE = 5;

const LeaderboardPage: React.FC = () => {
  usePageTitle('Leaderboard');

  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(mockLeaderboard.length / PAGE_SIZE);

  const visibleEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return mockLeaderboard.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage]);

  return (
    <PageContainer maxWidth="xl" className="space-y-8 py-10">
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-5 bg-yellow-100" padding="lg">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-600">
            Leaderboard
          </p>
          <h1 className="flex items-center gap-3 text-4xl font-black uppercase">
            <Trophy size={34} />
            Top creators
          </h1>
          <p className="max-w-2xl text-base leading-7 text-gray-700">
            A fast snapshot of creators earning the most support on Stellar Tipz. This scaffold view is fed by mock entries until leaderboard reads are connected to the contract.
          </p>
        </Card>

        <Podium creators={mockLeaderboard.slice(0, 3)} />
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
                  const rank = (currentPage - 1) * PAGE_SIZE + index + 1;

                  return (
                    <tr key={entry.address} className="border-b border-gray-300">
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
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </Card>
      </section>
    </PageContainer>
  );
};

export default LeaderboardPage;
