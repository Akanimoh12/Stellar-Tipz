import React from 'react';
import { Sparkles, Zap, Globe, Trophy, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: <Zap size={40} />,
    title: 'Lightning Fast',
    description: '3-5 second finality. Tips arrive instantly, not in weeks.',
  },
  {
    icon: <Sparkles size={40} />,
    title: 'Minimal Fees',
    description: 'Only 2% withdrawal fee. Keep 98% of what you earn.',
  },
  {
    icon: <Globe size={40} />,
    title: 'Global Access',
    description: 'Borderless payments. Anyone, anywhere, anytime.',
  },
  {
    icon: <Trophy size={40} />,
    title: 'Credit Score',
    description: 'Transparent credibility based on X (Twitter) metrics.',
  },
  {
    icon: <Shield size={40} />,
    title: 'Fully On-Chain',
    description: 'All transactions transparent and verifiable on Stellar.',
  },
  {
    icon: <Sparkles size={40} />,
    title: 'Simple URLs',
    description: 'Share your tipz.app/@username everywhere.',
  },
];

const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="py-20 px-4 bg-off-white border-t-3 border-b-3 border-black">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-5xl md:text-6xl font-black text-center mb-16"
        >
          WHY TIPZ?
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="card-brutalist hover:-translate-x-1 hover:-translate-y-1 transition-transform duration-200"
            >
              <div className="mb-4">{feature.icon}</div>
              <h3 className="text-2xl font-bold mb-3 uppercase">{feature.title}</h3>
              <p className="text-gray-700">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
