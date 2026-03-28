import React from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWallet } from '@/hooks/useWallet';

const HeroSection: React.FC = () => {
  const { connect } = useWallet();

  const handleLearnMore = () => {
    const featuresSection = document.getElementById('features');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center px-4 py-20">
      <div className="max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-8xl md:text-9xl font-black mb-4 tracking-tight">
            TIPZ
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              className="inline-block ml-4"
            >
              💫
            </motion.span>
          </h1>
          <div className="h-2 w-32 bg-black mx-auto mb-8" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-3xl md:text-5xl font-bold mb-6 max-w-4xl mx-auto leading-tight"
        >
          Empowering Creators Through
          <br />
          Decentralized Tipping
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto text-gray-700"
        >
          Send instant XLM tips to creators. Only 2% fees. 3-5 second finality.
          <br />
          Built on Stellar&apos;s lightning-fast blockchain.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
        >
          <button
            className="btn-brutalist text-lg group"
            onClick={() => connect()}
          >
            Get Started
            <ArrowRight
              className="inline-block ml-2 group-hover:translate-x-1 transition-transform"
              size={20}
            />
          </button>
          <button 
            className="btn-brutalist-outline text-lg"
            onClick={handleLearnMore}
          >
            Learn More
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto"
        >
          <div className="card-brutalist text-center">
            <div className="text-4xl font-black mb-2">2%</div>
            <div className="text-sm uppercase font-bold tracking-wide">Platform Fee</div>
            <div className="text-xs text-gray-600 mt-1">(vs 30–50% traditional)</div>
          </div>
          <div className="card-brutalist text-center">
            <div className="text-4xl font-black mb-2">3-5s</div>
            <div className="text-sm uppercase font-bold tracking-wide">Transaction Time</div>
            <div className="text-xs text-gray-600 mt-1">(vs 7–30 days traditional)</div>
          </div>
          <div className="card-brutalist text-center">
            <div className="text-4xl font-black mb-2">$0.0001</div>
            <div className="text-sm uppercase font-bold tracking-wide">Transaction Cost</div>
            <div className="text-xs text-gray-600 mt-1">(virtually free)</div>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-6 h-10 border-2 border-black rounded-full flex items-start justify-center p-2"
        >
          <div className="w-1 h-2 bg-black rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
