import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useContract } from '@/hooks';
import { LeaderboardEntry } from '@/types/contract';
import ProfileCard from '@/components/shared/ProfileCard';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/shared/ErrorState';
import { categorizeError } from '@/helpers/error';

export default function TopCreatorsSection() {
  const [creators, setCreators] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getLeaderboard } = useContract();
  const navigate = useNavigate();

  const fetchLeaderboard = useCallback(() => {
    setLoading(true);
    setError(null);
    getLeaderboard(5)
      .then((data) => {
        setCreators(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch leaderboard:', err);
        setError(String(err));
        setLoading(false);
      });
  }, [getLeaderboard]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handleViewFullLeaderboard = () => {
    navigate('/leaderboard');
  };

  return (
    <section className="py-24 px-6 bg-off-white overflow-hidden">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 border-2 border-black text-xs font-black uppercase tracking-widest">
              <Trophy size={14} />
              Leaderboard
            </div>
            <h2 className="text-4xl md:text-5xl font-black uppercase leading-none">
              Top Creators
            </h2>
            <p className="text-lg font-bold text-gray-600 max-w-xl">
              Meet the most supported creators in the Tipz ecosystem.
            </p>
          </div>

          <button
            onClick={handleViewFullLeaderboard}
            className="group inline-flex items-center gap-2 text-sm font-black uppercase tracking-wider hover:underline"
          >
            View Full Leaderboard
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {loading ? (
          <div className="flex gap-6 overflow-hidden pb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-64 flex-shrink-0">
                <Skeleton variant="rect" height="200px" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState 
            category={categorizeError(error)} 
            onRetry={fetchLeaderboard}
          />
        ) : creators.length === 0 ? (
          <div className="border-3 border-black bg-white">
            <EmptyState
              title="No creators yet"
              description="Be the first to tip someone and start the leaderboard!"
              action={{
                label: "Find Creators",
                onClick: () => navigate('/leaderboard')
              }}
            />
          </div>
        ) : (
          <div
            className="flex gap-6 overflow-x-auto pb-8 -mx-6 px-6 no-scrollbar"
            style={{ WebkitOverflowScrolling: 'touch' }}
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
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
