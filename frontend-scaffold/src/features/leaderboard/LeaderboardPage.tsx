import React, { useEffect, useMemo, useRef } from "react";
import { Crown, Loader2, Medal, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import PageContainer from "../../components/layout/PageContainer";
import AmountDisplay from "../../components/shared/AmountDisplay";
import CreditBadge from "../../components/shared/CreditBadge";
import ErrorState from "../../components/shared/ErrorState";
import PullToRefresh from "../../components/shared/PullToRefresh";
import Avatar from "../../components/ui/Avatar";
import Card from "../../components/ui/Card";
import { categorizeError } from "@/helpers/error";
import { useI18n } from "@/i18n";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { usePageTitle } from "@/hooks/usePageTitle";
import LeaderboardSkeleton from "./LeaderboardSkeleton";
import LeaderboardTable from "./LeaderboardTable";

const LeaderboardPage: React.FC = () => {
  usePageTitle("Leaderboard");

  const { entries, loading, error, refetch } = useLeaderboard();

  // Top 3 entries for podium display; ranks 4+ go to the paginated table.

const PAGE_SIZE = 20;

const LeaderboardPage: React.FC = () => {
  const { t } = useI18n();
  usePageTitle(t("leaderboard.title"));

  const { entries, loading, hasMore, error, loadMore, refetch } =
    useLeaderboard(PAGE_SIZE);
  const observerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerRef.current;
    if (!target || !hasMore) {
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof window.IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const topThree = useMemo(() => entries.slice(0, 3), [entries]);
  const remainingEntries = useMemo(() => entries.slice(3), [entries]);

  const leaderboardAnnouncement = error
    ? t("leaderboard.loadedError", {
        message: categorizeError(error).message,
      })
    : entries.length === 0
      ? t("leaderboard.loadedEmpty")
      : t("leaderboard.loadedWithCount", { count: entries.length });

  if (loading && entries.length === 0 && !error) {
    return <LeaderboardSkeleton count={25} />;
  }

  return (
    <PullToRefresh onRefresh={refetch}>
      <PageContainer maxWidth="xl" className="space-y-8 py-10">
        <section aria-labelledby="leaderboard-heading" className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-5 bg-yellow-100" padding="lg" hover>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-600">
              {t("leaderboard.title")}
            </p>
            <h1 id="leaderboard-heading" className="flex items-center gap-3 text-4xl font-black uppercase">
              <Trophy size={34} />
              {t("leaderboard.topCreators")}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-gray-700">
              {t("leaderboard.description")}
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {error ? (
              <div className="sm:col-span-3">
                <ErrorState category={categorizeError(error).category} onRetry={refetch} />
              </div>
            ) : (
              topThree.map((entry, index) => {
                const icons = [
                  <Crown key="crown" size={18} />,
                  <Medal key="silver" size={18} />,
                  <Medal key="bronze" size={18} />,
                ];
                const labels = [
                  t("leaderboard.place1"),
                  t("leaderboard.place2"),
                  t("leaderboard.place3"),
                ];

                return (
                  <Card key={entry.address} className="space-y-4" padding="lg" hover>
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm font-black uppercase">
                        {icons[index]}
                        {labels[index]}
                      </span>
                      <CreditBadge score={entry.creditScore} showScore={false} />
                    </div>
                    <Link to={`/@${entry.username}`} className="flex items-center gap-3">
                      <Avatar address={entry.address} alt={entry.username} fallback={entry.username} size="lg" />
                      <div>
                        <p className="text-lg font-black uppercase truncate max-w-[120px]">{entry.username}</p>
                        <AmountDisplay amount={entry.totalTipsReceived} className="text-sm" />
                      </div>
                    </Link>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        <section role="region" aria-labelledby="full-rankings-heading">
          <Card className="space-y-6" padding="lg">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 id="full-rankings-heading" className="text-2xl font-black uppercase">
                {t("leaderboard.fullRankings")}
              </h2>
              <Link to="/dashboard" className="text-sm font-black uppercase underline">
                {t("leaderboard.openDashboard")}
              </Link>
            </div>

            {remainingEntries.length > 0 ? (
              <div className="divide-y-2 divide-black border-2 border-black" role="list">
                {remainingEntries.map((entry, index) => (
                  <Link
                    key={entry.address}
                    to={`/@${entry.username}`}
                    className="grid gap-4 bg-white p-4 transition-colors hover:bg-yellow-50 sm:grid-cols-[72px_1fr_auto] sm:items-center"
                    role="listitem"
                  >
                    <span className="text-xl font-black tabular-nums">
                      #{index + 4}
                    </span>
                    <span className="flex items-center gap-3">
                      <Avatar address={entry.address} alt={entry.username} fallback={entry.username} size="md" />
                      <span className="min-w-0">
                        <span className="block truncate text-base font-black uppercase">
                          {entry.username}
                        </span>
                        <AmountDisplay amount={entry.totalTipsReceived} className="text-sm" />
                      </span>
                    </span>
                    <CreditBadge score={entry.creditScore} showScore />
                  </Link>
                ))}
              </div>
            ) : (
              !error && (
                <p className="border-2 border-dashed border-gray-300 p-6 text-center text-sm font-bold uppercase text-gray-600">
                  {t("leaderboard.empty")}
                </p>
              )
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 p-8 text-gray-600">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm font-bold uppercase">
                  {t("leaderboard.loadingMore")}
                </span>
              </div>
            )}

            {!hasMore && entries.length > 0 && (
              <div className="text-center p-8 border-t-2 border-dashed border-gray-300">
                <p className="text-sm font-bold text-gray-600 uppercase">
                  {t("leaderboard.endReached")}
                </p>
              </div>
            )}

            <div ref={observerRef} className="h-4" />
          </Card>
        </section>

        <div role="status" aria-live="polite" className="sr-only">
          {leaderboardAnnouncement}
        </div>
      </PageContainer>
    </PullToRefresh>
  );
};

export default LeaderboardPage;
