import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/hooks';
import { useContract } from '@/hooks';

const CTASection: React.FC = () => {
  const [totalCreators, setTotalCreators] = useState<number>(0);
  const { connected, connect } = useWallet();
  const { getStats } = useContract();
  const navigate = useNavigate();

  useEffect(() => {
    getStats()
      .then((stats) => setTotalCreators(stats.totalCreators))
      .catch(() => {
        // Contract may not be deployed yet — display gracefully
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateProfile = () => {
    if (!connected) {
      connect();
    } else {
      navigate('/profile');
    }
  };

  return (
    <section className="py-20 px-4 bg-off-white border-t-3 border-black">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-5xl md:text-6xl font-black mb-6">
            Start Receiving Tips Today
          </h2>
          <p className="text-xl md:text-2xl mb-12 text-gray-700">
            Join{' '}
            {totalCreators > 0 ? (
              <strong>{totalCreators.toLocaleString()} creators</strong>
            ) : (
              'thousands of creators'
            )}{' '}
            already on Tipz
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button className="btn-brutalist text-lg group" onClick={handleCreateProfile}>
              Create Profile
              <ArrowRight
                className="inline-block ml-2 group-hover:translate-x-1 transition-transform"
                size={20}
              />
            </button>
            <button
              className="btn-brutalist-outline text-lg"
              onClick={() => navigate('/leaderboard')}
            >
              Browse Creators
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
