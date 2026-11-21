import React from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

import { useWallet } from "@/hooks/useWallet";
import { useI18n } from "@/i18n";

const HeroSection: React.FC = () => {
  const { connect } = useWallet();
  const { t } = useI18n();

  const handleLearnMore = () => {
    const featuresSection = document.getElementById("features") || document.getElementById("how-it-works");
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: "smooth" });
      featuresSection.setAttribute("tabindex", "-1");
      featuresSection.focus({ preventScroll: true });
    }
  };

  return (
    <section
      id="hero"
      aria-labelledby="landing-title"
      className="relative flex min-h-screen items-center justify-center px-4 py-20"
    >
      <div className="mx-auto max-w-6xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 id="landing-title" className="mb-4 text-8xl font-black tracking-tight md:text-9xl">
            TIPZ
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
              className="ml-4 inline-block"
            >
              *
            </motion.span>
          </h1>
          <div className="mx-auto mb-8 h-2 w-32 bg-black" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mb-6 max-w-4xl text-3xl font-bold leading-tight md:text-5xl"
        >
          {t("landing.hero.heading")}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mx-auto mb-12 max-w-3xl text-xl text-gray-700 md:text-2xl"
        >
          {t("landing.hero.copy")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <button
            type="button"
            className="btn-brutalist group text-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2"
            data-tour-id="tour-wallet-connect"
            onClick={() => connect()}
          >
            {t("landing.hero.getStarted")}
            <ArrowRight
              className="ml-2 inline-block transition-transform group-hover:translate-x-1"
              size={20}
            />
          </button>
          <button
            type="button"
            className="btn-brutalist-outline text-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2"
            onClick={handleLearnMore}
          >
            {t("landing.hero.learnMore")}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3"
        >
          <div className="card-brutalist text-center">
            <div className="mb-2 text-4xl font-black">2%</div>
            <div className="text-sm font-bold uppercase tracking-wide">
              {t("landing.hero.platformFee")}
            </div>
            <div className="mt-1 text-xs text-gray-600">
              {t("landing.hero.feeCompare")}
            </div>
          </div>
          <div className="card-brutalist text-center">
            <div className="mb-2 text-4xl font-black">3-5s</div>
            <div className="text-sm font-bold uppercase tracking-wide">
              {t("landing.hero.transactionTime")}
            </div>
            <div className="mt-1 text-xs text-gray-600">
              {t("landing.hero.timeCompare")}
            </div>
          </div>
          <div className="card-brutalist text-center">
            <div className="mb-2 text-4xl font-black">$0.0001</div>
            <div className="text-sm font-bold uppercase tracking-wide">
              {t("landing.hero.transactionCost")}
            </div>
            <div className="mt-1 text-xs text-gray-600">
              {t("landing.hero.costCompare")}
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="flex h-10 w-6 items-start justify-center rounded-full border-2 border-black p-2"
        >
          <div className="h-2 w-1 rounded-full bg-black" />
        </motion.div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
