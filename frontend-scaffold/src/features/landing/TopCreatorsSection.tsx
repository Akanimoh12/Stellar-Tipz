import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useContract } from '@/hooks';
import { LeaderboardEntry } from '@/types/contract';

const MEDAL = ['🥇', '🥈', '🥉'];

const TopCreatorsSection: React.FC = () => {
  const [creators, setCreators] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { getLeaderboard } = useContract();
  const navigate = useNavigate();

  useEffect(() => {
    getLeaderboard(5)
      .then(setCreators)
      .catch(() => {
        // Contract may not be deployed yet — render empty gracefully
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loading && creators.length === 0) return null;

  return (
    <section className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-5xl md:text-6xl font-black text-center mb-4"
        >
          TOP CREATORS
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-center text-gray-600 mb-12"
        >
          The most-tipped creators on Tipz this week
        </motion.p>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card-brutalist animate-pulse h-16" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {creators.map((creator, index) => (
              <motion.button
                key={creator.address}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="card-brutalist w-full flex items-center gap-4 text-left hover:-translate-y-0.5 transition-transform duration-150"
                onClick={() => navigate(`/@${creator.username}`)}
              >
                <span className="text-2xl w-8 flex-shrink-0">
                  {index < 3 ? MEDAL[index] : <Trophy size={20} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-lg truncate">@{creator.username}</div>
                  <div className="text-sm text-gray-600 truncate">
                    Score: {creator.creditScore}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold">{creator.totalTipsReceived} XLM</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">received</div>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-10"
        >
          <button
            className="btn-brutalist-outline"
            onClick={() => navigate('/leaderboard')}
          >
            View Full Leaderboard →
          </button>
        </motion.div>
      </div>
    </section>
  );
};

export default TopCreatorsSection;
