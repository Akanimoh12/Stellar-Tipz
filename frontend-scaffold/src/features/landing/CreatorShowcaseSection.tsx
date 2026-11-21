import React, { useState } from "react";
import TopCreatorsSection from "./TopCreatorsSection";
import TrendingCreatorsSection from "./TrendingCreatorsSection";
import { Trophy, Flame } from "lucide-react";

export type CreatorShowcaseTab = "top" | "trending";

interface CreatorShowcaseProps {
  defaultTab?: CreatorShowcaseTab;
}

/**
 * Consolidated creator showcase section merging top creators and trending creators
 * into a single unified showcase with toggleable views.
 * Resolves component duplication on the landing page (refs #1660).
 */
export const CreatorShowcaseSection: React.FC<CreatorShowcaseProps> = ({ defaultTab = "top" }) => {
  const [activeTab, setActiveTab] = useState<CreatorShowcaseTab>(defaultTab);

  return (
    <section
      id="creators-showcase"
      role="region"
      aria-label="Creator Showcase"
      className="py-12 bg-white"
    >
      <div className="max-w-7xl mx-auto px-6 mb-6">
        <div className="flex items-center gap-4 border-b-2 border-black pb-4">
          <button
            type="button"
            onClick={() => setActiveTab("top")}
            aria-pressed={activeTab === "top"}
            className={`inline-flex items-center gap-2 px-4 py-2 font-black uppercase text-sm border-2 border-black transition-all ${
              activeTab === "top"
                ? "bg-yellow-400 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Trophy size={16} />
            Top Creators
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("trending")}
            aria-pressed={activeTab === "trending"}
            className={`inline-flex items-center gap-2 px-4 py-2 font-black uppercase text-sm border-2 border-black transition-all ${
              activeTab === "trending"
                ? "bg-orange-400 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Flame size={16} />
            Trending
          </button>
        </div>
      </div>

      {activeTab === "top" ? (
        <TopCreatorsSection />
      ) : (
        <TrendingCreatorsSection />
      )}
    </section>
  );
};

export default CreatorShowcaseSection;
