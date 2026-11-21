import React, { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import { useContract, useWallet } from "@/hooks";
import { useI18n } from "@/i18n";

const CTASection: React.FC = () => {
  const [totalCreators, setTotalCreators] = useState<number>(0);
  const { connected, connect } = useWallet();
  const { getStats } = useContract();
  const navigate = useNavigate();
  const { t } = useI18n();

  useEffect(() => {
    getStats()
      .then((stats) => setTotalCreators(stats.totalCreators))
      .catch(() => {
        // Contract may not be deployed yet; display gracefully.
      });
  }, [getStats]);

  const handleCreateProfile = () => {
    if (!connected) {
      connect();
    } else {
      navigate("/profile");
    }
  };

  return (
    <section
      role="region"
      aria-labelledby="landing-cta-heading"
      className="border-t-3 border-black bg-off-white px-4 py-20"
    >
      <div className="mx-auto max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 id="landing-cta-heading" className="mb-6 text-5xl font-black md:text-6xl">
            {t("landing.cta.heading")}
          </h2>
          <p className="mb-12 text-xl text-gray-700 md:text-2xl">
            {totalCreators > 0
              ? t("landing.cta.join", {
                  count: totalCreators.toLocaleString(),
                })
              : t("landing.cta.joinFallback")}
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              className="btn-brutalist group text-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2"
              data-tour-id="tour-register"
              onClick={handleCreateProfile}
            >
              {t("landing.cta.createProfile")}
              <ArrowRight
                className="ml-2 inline-block transition-transform group-hover:translate-x-1"
                size={20}
              />
            </button>
            <button
              type="button"
              className="btn-brutalist-outline text-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2"
              data-tour-id="tour-browse-creators"
              onClick={() => navigate("/leaderboard")}
            >
              {t("landing.cta.browseCreators")}
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
