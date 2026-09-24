import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useContract } from "@/hooks";
import { LeaderboardEntry } from "@/types/contract";
import ProfileCard from "@/components/shared/ProfileCard";
import ProfileCardSkeleton from "@/components/shared/ProfileCardSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/shared/ErrorState";
import { categorizeError } from "@/helpers/error";
import { env } from "@/helpers/env";
import { logger } from "../../services/logger";
import { mockLeaderboard } from "@/features/mockData";
import { useI18n } from "@/i18n";

export default function TopCreatorsSection() {
  const { t } = useI18n();
  const [creators, setCreators] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(
    Boolean(env.contractId) || import.meta.env.MODE === "test",
  );
  const [error, setError] = useState<string | null>(null);
  const { getLeaderboard } = useContract();
  const navigate = useNavigate();

  const fetchCreators = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (env.useMockData) {
      if (import.meta.env.PROD) {
        logger.error(
          'features/landing/TopCreatorsSection',
          'VITE_USE_MOCK_DATA enabled in production build — real leaderboard will not be displayed',
        );
      }
      setCreators(mockLeaderboard.slice(0, 5));
      setLoading(false);
      return;
    }

    if (!env.contractId) {
      setCreators([]);
      setLoading(false);
      return;
    }

    try {
      const data = await getLeaderboard(5);
      setCreators(data);
    } catch (err) {
      logger.error(
        'features/landing/TopCreatorsSection',
        'Failed to fetch leaderboard',
        undefined,
        err instanceof Error ? err : new Error(String(err)),
      );
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [getLeaderboard]);

  useEffect(() => {
    void fetchCreators();
  }, [fetchCreators]);

  const handleRetry = useCallback(() => {
    if (
      !env.contractId &&
      !env.useMockData &&
      import.meta.env.MODE !== "test"
    ) {
      setCreators([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    getLeaderboard(5)
      .then((data) => {
        setCreators(data);
        setLoading(false);
      })
      .catch((err) => {
        logger.error('features/landing/TopCreatorsSection', 'Failed to fetch leaderboard', undefined, err instanceof Error ? err : new Error(String(err)));
        setError(String(err));
        setLoading(false);
      });
  }, [getLeaderboard]);

  const handleViewFullLeaderboard = () => {
    navigate("/leaderboard");
  };

  return (
    <section
      role="region"
      aria-labelledby="top-creators-heading"
      className="py-24 px-6 bg-off-white overflow-hidden"
    >
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 border-2 border-black text-xs font-black uppercase tracking-widest">
              <Trophy size={14} />
              {t("landing.top.badge")}
            </div>
            <h2
              id="top-creators-heading"
              className="text-4xl md:text-5xl font-black uppercase leading-none"
            >
              {t("landing.top.heading")}
            </h2>
            <p className="text-lg font-bold text-gray-600 max-w-xl">
              {t("landing.top.description")}
            </p>
          </div>

          <button
            onClick={handleViewFullLeaderboard}
            className="group inline-flex items-center gap-2 text-sm font-black uppercase tracking-wider hover:underline"
          >
            {t("landing.top.viewFull")}
            <ArrowRight
              size={18}
              className="group-hover:translate-x-1 transition-transform"
            />
          </button>
        </div>

        {loading ? (
          <div className="flex gap-6 overflow-hidden pb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <ProfileCardSkeleton key={i} variant="compact" />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            category={categorizeError(error).category}
            message={categorizeError(error).message}
            onRetry={handleRetry}
          />
        ) : creators.length === 0 ? (
          <div className="border-3 border-black bg-white">
            <EmptyState
              title={t("landing.top.emptyTitle")}
              description={t("landing.top.emptyDescription")}
              action={{
                label: t("landing.top.emptyAction"),
                onClick: () => navigate("/leaderboard"),
              }}
            />
          </div>
        ) : (
          <div
            className="flex gap-6 overflow-x-auto pb-8 -mx-6 px-6 no-scrollbar"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {creators.map((creator, index) => (
              <motion.div
                key={creator.address}
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
              >
                <ProfileCard
                  variant="compact"
                  handle={creator.username}
                  publicKey={creator.address}
                  totalTips={creator.totalTipsReceived}
                  creditScore={creator.creditScore}
                  onTip={() => navigate(`/@${creator.username}`)}
                  dataTourId={index === 0 ? 'tour-send-tip' : undefined}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
