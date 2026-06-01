import React from "react";
import { Flame, Trophy } from "lucide-react";

interface StreakDisplayProps {
  /** Current active streak in days */
  current: number;
  /** Longest streak ever recorded */
  longest: number;
  className?: string;
}

/**
 * Displays the current and longest tipping streak for a creator.
 * Shows an empty state when both values are zero.
 */
const StreakDisplay: React.FC<StreakDisplayProps> = ({
  current,
  longest,
  className = "",
}) => {
  if (current === 0 && longest === 0) {
    return (
      <div
        className={`border-[3px] border-gray-200 bg-gray-50 p-4 text-center ${className}`}
        aria-label="No streak yet"
      >
        <Flame size={24} className="mx-auto mb-2 text-gray-300" aria-hidden="true" />
        <p className="text-sm font-bold text-gray-400">
          No streak yet
        </p>
        <p className="text-xs font-bold text-gray-400 mt-1">
          Tip a creator every day to build a streak!
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 gap-3 ${className}`}
      role="region"
      aria-label="Streak statistics"
    >
      <div
        className={`flex flex-col items-center gap-1 border-[3px] p-4 text-center ${
          current > 0
            ? "border-orange-400 bg-orange-50"
            : "border-gray-200 bg-gray-50"
        }`}
        aria-label={`Current streak: ${current} day${current !== 1 ? "s" : ""}`}
      >
        <Flame
          size={24}
          className={current > 0 ? "text-orange-500" : "text-gray-300"}
          aria-hidden="true"
        />
        <p
          className={`text-3xl font-black tabular-nums ${
            current > 0 ? "text-orange-600" : "text-gray-300"
          }`}
        >
          {current}
        </p>
        <p className="text-xs font-black uppercase tracking-wide text-gray-600">
          Current streak
        </p>
        <p className="text-[10px] font-bold text-gray-500">days</p>
      </div>

      <div
        className="flex flex-col items-center gap-1 border-[3px] border-yellow-400 bg-yellow-50 p-4 text-center"
        aria-label={`Longest streak: ${longest} day${longest !== 1 ? "s" : ""}`}
      >
        <Trophy size={24} className="text-yellow-600" aria-hidden="true" />
        <p className="text-3xl font-black tabular-nums text-yellow-700">
          {longest}
        </p>
        <p className="text-xs font-black uppercase tracking-wide text-gray-600">
          Longest streak
        </p>
        <p className="text-[10px] font-bold text-gray-500">days</p>
      </div>
    </div>
  );
};

export default StreakDisplay;
