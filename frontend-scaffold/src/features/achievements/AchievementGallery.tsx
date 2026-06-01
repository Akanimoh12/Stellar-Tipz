import React from "react";
import { ACHIEVEMENTS, AchievementId } from "@/hooks/useAchievements";
import AchievementCard from "./AchievementCard";

interface AchievementGalleryProps {
  /** IDs of achievements the user has unlocked */
  unlockedIds: AchievementId[];
  /** Unix ms timestamp for each unlocked achievement */
  unlockedAt?: Partial<Record<AchievementId, number>>;
  className?: string;
}

/**
 * Displays all achievements in a grid, showing locked/unlocked state with earned dates.
 * Used on the profile page and public creator pages to showcase earned achievements.
 */
const AchievementGallery: React.FC<AchievementGalleryProps> = ({
  unlockedIds,
  unlockedAt = {},
  className = "",
}) => {
  const all = Object.values(ACHIEVEMENTS);
  const earned = unlockedIds.length;
  const total = all.length;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-black uppercase tracking-tight">
          Achievements
        </h3>
        <span className="text-xs font-black uppercase tracking-wide text-gray-500">
          {earned}/{total} earned
        </span>
      </div>

      {earned === 0 && (
        <p className="mb-4 text-sm font-bold text-gray-500">
          No achievements yet — keep tipping to unlock badges!
        </p>
      )}

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        role="list"
        aria-label="Achievement gallery"
      >
        {all.map((achievement, i) => (
          <AchievementCard
            key={achievement.id}
            achievement={achievement}
            isUnlocked={unlockedIds.includes(achievement.id)}
            unlockedAt={unlockedAt[achievement.id]}
            index={i}
          />
        ))}
      </div>
    </div>
  );
};

export default AchievementGallery;
