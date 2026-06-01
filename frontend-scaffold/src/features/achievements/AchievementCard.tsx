import React from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { Achievement } from "@/hooks/useAchievements";

interface AchievementCardProps {
  achievement: Achievement;
  isUnlocked: boolean;
  /** Unix ms timestamp when this achievement was earned */
  unlockedAt?: number;
  /** Animation stagger index */
  index?: number;
}

const AchievementCard: React.FC<AchievementCardProps> = ({
  achievement,
  isUnlocked,
  unlockedAt,
  index = 0,
}) => {
  const earnedDate = unlockedAt
    ? new Date(unlockedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <motion.div
      role="listitem"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`flex flex-col items-center gap-2 border-[3px] p-4 text-center transition-transform duration-200 ${
        isUnlocked
          ? "border-black bg-yellow-50 hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
          : "border-gray-300 bg-gray-50 opacity-50"
      }`}
      aria-label={
        isUnlocked
          ? `${achievement.label} — unlocked${earnedDate ? ` on ${earnedDate}` : ""}`
          : `${achievement.label} — locked`
      }
    >
      <span className="text-3xl leading-none" aria-hidden="true">
        {isUnlocked ? (
          achievement.emoji
        ) : (
          <Lock size={28} className="text-gray-400" />
        )}
      </span>

      <p
        className={`text-xs font-black uppercase tracking-wide ${
          isUnlocked ? "text-black" : "text-gray-400"
        }`}
      >
        {achievement.label}
      </p>

      <p
        className={`text-xs font-bold leading-snug ${
          isUnlocked ? "text-gray-700" : "text-gray-400"
        }`}
      >
        {achievement.description}
      </p>

      {isUnlocked && earnedDate && (
        <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-green-700">
          Earned {earnedDate}
        </p>
      )}

      {isUnlocked && !earnedDate && (
        <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-green-600">
          Earned
        </p>
      )}
    </motion.div>
  );
};

export default AchievementCard;
