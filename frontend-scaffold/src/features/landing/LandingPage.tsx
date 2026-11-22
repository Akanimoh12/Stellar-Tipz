import React from "react";
import Divider from "@/components/ui/Divider";
import HeroSection from "./HeroSection";
import FeaturesSection from "./FeaturesSection";
import HowItWorksSection from "./HowItWorksSection";
import StatsSection from "./StatsSection";
import CreatorShowcaseSection from "./CreatorShowcaseSection";
import TopCreatorsSection from "./TopCreatorsSection";
import TrendingCreatorsSection from "./TrendingCreatorsSection";
import CTASection from "./CTASection";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useI18n } from "@/i18n";

import { FeatureErrorBoundary } from "@/components/shared/ErrorBoundary";

/**
 * Landing page assembled from individual section components.
 * Each section is separated by a Divider. The page renders gracefully
 * even when the contract is not yet deployed.
 */
const LandingPage: React.FC = () => {
  const { t } = useI18n();
  usePageMeta({ title: t("landing.title") });

  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-label={t("landing.aria")}
      className="min-h-screen bg-white focus:outline-none"
    >
      <FeatureErrorBoundary name="landing-hero">
        <HeroSection />
      </FeatureErrorBoundary>
      <Divider />
      <FeatureErrorBoundary name="landing-features">
        <FeaturesSection />
      </FeatureErrorBoundary>
      <Divider />
      <FeatureErrorBoundary name="landing-how-it-works">
        <section
          id="how-it-works"
          role="region"
          aria-label={t("landing.how.aria")}
        >
          <HowItWorksSection />
        </section>
      </FeatureErrorBoundary>
      <Divider />
      <FeatureErrorBoundary name="landing-stats">
        <StatsSection />
      </FeatureErrorBoundary>
      <Divider />
      <FeatureErrorBoundary name="landing-creator-showcase">
        <CreatorShowcaseSection />
      </FeatureErrorBoundary>
      <Divider />
      <FeatureErrorBoundary name="landing-cta">
        <CTASection />
      </FeatureErrorBoundary>
    </main>
  );
};

export default LandingPage;
