import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useContract } from '@/hooks';
import { useToastStore } from '@/store/toastStore';
import { ContractStats } from '@/types/contract';
import { categorizeError, ERRORS } from '@/helpers/error';
import { env } from '@/helpers/env';
import Skeleton from '@/components/ui/Skeleton';
import { logger } from '../../services/logger';
import { useI18n } from '@/i18n';

const FALLBACK_STATS = {
  feePct: 2,
  settlementTime: '3-5s',
  txCost: '$0.0001',
  feesSaved: '95%',
  speedup: '10,000×',
};

// Demo stats shown when VITE_USE_MOCK_DATA=true or contract is unavailable
const MOCK_STATS: ContractStats = {
  totalCreators: 1234,
  totalTipsCount: 8765,
  totalTipsVolume: '0',
  totalFeesCollected: '0',
  feeBps: 200, // 2%
};

const comparisonRows = [
  { featureKey: 'stats.fees', traditional: '30-50%', tipz: '2%', highlight: true },
  { featureKey: 'stats.settlement', traditional: '7-30 days', tipz: '3-5 seconds', highlight: true },
  { featureKey: 'stats.access', traditionalKey: 'stats.regional', tipzKey: 'stats.global', highlight: false },
  { featureKey: 'stats.transparency', traditionalKey: 'stats.hidden', tipzKey: 'stats.onChain', highlight: false },
];

const StatsSection: React.FC = () => {
  const { t } = useI18n();
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { getStats } = useContract();

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setHasError(false);

      if (env.useMockData) {
        if (import.meta.env.PROD) {
          logger.error(
            'features/landing/StatsSection',
            'VITE_USE_MOCK_DATA enabled in production build — real stats will not be displayed',
          );
        }
        setStats(MOCK_STATS);
        setLoading(false);
        return;
      }

      if (!env.contractId) {
        setStats(null);
        setLoading(false);
        return;
      }

      try {
        const data = await getStats();
        setStats(data);
      } catch (err) {
        logger.warn(
          'features/landing/StatsSection',
          'Could not fetch live platform stats',
          undefined,
          err instanceof Error ? err : new Error(String(err)),
        );
        setHasError(true);
        const { addToast } = useToastStore.getState();
        addToast({
          message: categorizeError(err).category === 'network'
            ? ERRORS.NETWORK
            : t('stats.liveError'),
          type: 'error',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      role="region"
      aria-labelledby="stats-heading"
      className="py-20 px-4 bg-off-white border-t-3 border-b-3 border-black"
    >
      <div className="max-w-6xl mx-auto">
        <motion.h2
          id="stats-heading"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-5xl md:text-6xl font-black text-center mb-16"
        >
          {t("stats.heading")}
        </motion.h2>

        {/* Live or mock stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="card-brutalist text-center">
            <div className="text-4xl font-black mb-1">
              {loading ? (
                <div className="flex justify-center" role="status" aria-busy="true">
                  <Skeleton variant="text" width="140px" height="40px" />
                </div>
              ) : stats ? (
                stats.totalCreators.toLocaleString()
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
            <div className="text-sm uppercase font-bold tracking-wide">
              {t("stats.creators")}
            </div>
          </div>
          <div className="card-brutalist text-center">
            <div className="text-4xl font-black mb-1">
              {loading ? (
                <div className="flex justify-center" role="status" aria-busy="true">
                  <Skeleton variant="text" width="140px" height="40px" />
                </div>
              ) : stats ? (
                stats.totalTipsCount.toLocaleString()
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
            <div className="text-sm uppercase font-bold tracking-wide">
              {t("stats.tipsSent")}
            </div>
          </div>
          <div className="card-brutalist text-center">
            <div className="text-4xl font-black mb-1">
              {loading ? (
                <div className="flex justify-center" role="status" aria-busy="true">
                  <Skeleton variant="text" width="110px" height="40px" />
                </div>
              ) : stats ? (
                `${stats.feeBps / 100}%`
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
            <div className="text-sm uppercase font-bold tracking-wide">
              {t("stats.platformFee")}
            </div>
          </div>
        </motion.div>

        {/* Comparison table */}
        <div className="card-brutalist overflow-x-auto mb-8">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-4 px-4 font-black uppercase">{t("stats.feature")}</th>
                <th className="text-left py-4 px-4 font-black uppercase">{t("stats.traditional")}</th>
                <th className="text-left py-4 px-4 font-black uppercase bg-black text-white">{t("stats.tipz")}</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.featureKey} className="border-b border-gray-300">
                  <td className="py-4 px-4 font-bold">{t(row.featureKey)}</td>
                  <td className="py-4 px-4 text-gray-600">{row.traditionalKey ? t(row.traditionalKey) : row.traditional}</td>
                  <td className={`py-4 px-4 font-bold ${row.highlight ? 'text-green-600' : ''}`}>
                    {row.tipzKey ? t(row.tipzKey) : row.tipz}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <div className="inline-block card-brutalist bg-black text-white px-8 py-4">
            <p className="text-2xl font-black">
              {t("stats.savingsFaster", {
                savings: FALLBACK_STATS.feesSaved,
                speedup: FALLBACK_STATS.speedup,
              })}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default StatsSection;
