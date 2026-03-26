import React from 'react';
import Divider from '@/components/ui/Divider';
import HeroSection from './HeroSection';
import FeaturesSection from './FeaturesSection';
import HowItWorksSection from './HowItWorksSection';
import StatsSection from './StatsSection';
import TopCreatorsSection from './TopCreatorsSection';
import CTASection from './CTASection';

/**
 * Landing page assembled from individual section components.
 * Each section is separated by a Divider. The page renders gracefully
 * even when the contract is not yet deployed.
 */
const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white">
      <HeroSection />
      <Divider />
      <FeaturesSection />
      <Divider />
      <section id="how-it-works">
        <HowItWorksSection />
      </section>
      <Divider />
      <StatsSection />
      <Divider />
      <TopCreatorsSection />
      <Divider />
      <CTASection />
    </div>
  );
};

export default LandingPage;
