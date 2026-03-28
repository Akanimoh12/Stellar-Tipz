import React from "react";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";

import PageContainer from "@/components/layout/PageContainer";
import AmountDisplay from "@/components/shared/AmountDisplay";
import CreditBadge from "@/components/shared/CreditBadge";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { LeaderboardEntry } from "@/types";
import { mockLeaderboard } from "../mockData";

const PodiumCard: React.FC<{
  entry: LeaderboardEntry;
  place: 1 | 2 | 3;
}> = ({ entry, place }) => {
  const heights: Record<1 | 2 | 3, string> = {
    1: "min-h-[220px] md:min-h-[260px]",
    2: "min-h-[180px] md:min-h-[200px]",
    3: "min-h-[160px] md:min-h-[180px]",
  };
  const labels: Record<1 | 2 | 3, string> = {
    1: "1st",
    2: "2nd",
    3: "3rd",
  };

  return (
    <Card
      padding="lg"
      className={`flex flex-col justify-between ${heights[place]} ${
        place === 1 ? "relative z-10 ring-2 ring-black md:scale-[1.02]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-4xl font-black leading-none">{labels[place]}</span>
        <CreditBadge score={entry.creditScore} showScore={false} className="shrink-0" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            address={entry.address}
            alt={entry.username}
            fallback={entry.username}
            size="lg"
          />
          <div className="min-w-0">
            <Link
              to={`/@${entry.username}`}
              className="text-xl font-black uppercase hover:underline break-all md:text-2xl"
            >
              @{entry.username}
            </Link>
            <div className="mt-1">
              <AmountDisplay amount={entry.totalTipsReceived} className="text-sm" />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const LeaderboardPage: React.FC = () => {
  usePageTitle("Leaderboard");

  const top3 = mockLeaderboard.slice(0, 3);
  const second = top3[1];
  const first = top3[0];
  const third = top3[2];
  const rest = mockLeaderboard.slice(3);

  return (
    <PageContainer maxWidth="lg" className="space-y-10 py-10">
      <header className="flex flex-wrap items-center gap-4 border-b-3 border-black pb-6">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center border-3 border-black bg-black text-white"
          style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
        >
          <Trophy className="h-8 w-8" aria-hidden />
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">Leaderboard</h1>
          <p className="mt-1 text-sm font-bold uppercase tracking-wide text-gray-600">
            Top creators by tips received
          </p>
        </div>
      </header>

      <section aria-label="Top three creators">
        <h2 className="sr-only">Podium — top three</h2>
        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3 md:items-end md:gap-3">
          {second && (
            <div className="md:order-1 md:pt-8">
              <PodiumCard entry={second} place={2} />
            </div>
          )}
          {first && (
            <div className="md:order-2">
              <PodiumCard entry={first} place={1} />
            </div>
          )}
          {third && (
            <div className="md:order-3 md:pt-12">
              <PodiumCard entry={third} place={3} />
            </div>
          )}
        </div>
      </section>

      <section aria-label="Additional leaderboard rankings">
        <h2 className="mb-4 text-2xl font-black uppercase">More creators</h2>
        {rest.length === 0 ? (
          <p className="text-sm font-bold text-gray-600">No additional entries yet.</p>
        ) : (
          <div
            className="overflow-x-auto border-3 border-black bg-white"
            style={{ boxShadow: "4px 4px 0px 0px rgba(0,0,0,1)" }}
          >
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b-3 border-black bg-off-white">
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-black uppercase tracking-[0.15em]"
                  >
                    Rank
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-black uppercase tracking-[0.15em]"
                  >
                    Creator
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-black uppercase tracking-[0.15em]"
                  >
                    Tips received
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-xs font-black uppercase tracking-[0.15em]"
                  >
                    Credit
                  </th>
                </tr>
              </thead>
              <tbody>
                {rest.map((row, index) => {
                  const rank = index + 4;
                  return (
                    <tr key={row.address} className="border-b-2 border-black last:border-b-0">
                      <td className="px-4 py-4 font-black tabular-nums">{rank}</td>
                      <td className="px-4 py-4">
                        <Link
                          to={`/@${row.username}`}
                          className="flex items-center gap-3 font-black uppercase hover:underline"
                        >
                          <Avatar
                            address={row.address}
                            alt={row.username}
                            fallback={row.username}
                            size="md"
                          />
                          <span>{row.username}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <AmountDisplay amount={row.totalTipsReceived} className="text-sm" />
                      </td>
                      <td className="px-4 py-4">
                        <CreditBadge score={row.creditScore} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageContainer>
  );
};

export default LeaderboardPage;
