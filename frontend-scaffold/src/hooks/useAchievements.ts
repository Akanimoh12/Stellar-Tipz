import { useState, useCallback, useEffect } from "react";

export type AchievementId =
  | "first_tip"
  | "ten_tips"
  | "hundred_tips"
  | "streak_3"
  | "streak_7"
  | "streak_30";

export interface Achievement {
  id: AchievementId;
  label: string;
  description: string;
  emoji: string;
}

export const ACHIEVEMENTS: Record<AchievementId, Achievement> = {
  first_tip: {
    id: "first_tip",
    label: "First Tip",
    description: "Sent your very first tip on Stellar Tipz.",
    emoji: "🎉",
  },
  ten_tips: {
    id: "ten_tips",
    label: "10 Tips",
    description: "Sent 10 tips to creators.",
    emoji: "🔥",
  },
  hundred_tips: {
    id: "hundred_tips",
    label: "100 Tips",
    description: "Sent 100 tips — you're a super supporter!",
    emoji: "💯",
  },
  streak_3: {
    id: "streak_3",
    label: "3-Day Streak",
    description: "Tipped creators 3 days in a row.",
    emoji: "⚡",
  },
  streak_7: {
    id: "streak_7",
    label: "7-Day Streak",
    description: "Tipped creators 7 days in a row.",
    emoji: "🌟",
  },
  streak_30: {
    id: "streak_30",
    label: "30-Day Streak",
    description: "Tipped creators 30 days in a row — legendary!",
    emoji: "💎",
  },
};

const STORAGE_KEY = "tipz-achievements";

function loadUnlocked(): AchievementId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AchievementId[]) : [];
  } catch {
    return [];
  }
}

function saveUnlocked(ids: AchievementId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage errors
  }
}

/**
 * Derives which achievements should be unlocked based on tip count and streak.
 */
function deriveAchievements(
  tipCount: number,
  streak: number,
): AchievementId[] {
  const unlocked: AchievementId[] = [];
  if (tipCount >= 1) unlocked.push("first_tip");
  if (tipCount >= 10) unlocked.push("ten_tips");
  if (tipCount >= 100) unlocked.push("hundred_tips");
  if (streak >= 3) unlocked.push("streak_3");
  if (streak >= 7) unlocked.push("streak_7");
  if (streak >= 30) unlocked.push("streak_30");
  return unlocked;
}

interface UseAchievementsOptions {
  tipCount?: number;
  streak?: number;
}

interface UseAchievementsReturn {
  /** All unlocked achievement IDs */
  unlockedIds: AchievementId[];
  /** Full achievement objects for unlocked achievements */
  unlocked: Achievement[];
  /** The most recently unlocked achievement (for notification display) */
  newAchievement: Achievement | null;
  /** Manually trigger an achievement unlock (e.g. after a tip action) */
  triggerAchievement: (id: AchievementId) => void;
  /** Dismiss the new-achievement notification */
  dismissNotification: () => void;
}

/**
 * Hook for tracking tipping achievements and streaks.
 * Persists unlocked achievements to localStorage.
 * Derives new unlocks from tipCount and streak props.
 */
export function useAchievements({
  tipCount = 0,
  streak = 0,
}: UseAchievementsOptions = {}): UseAchievementsReturn {
  const [unlockedIds, setUnlockedIds] = useState<AchievementId[]>(loadUnlocked);
  const [newAchievement, setNewAchievement] = useState<Achievement | null>(null);

  // Derive achievements from current stats and unlock any new ones
  useEffect(() => {
    const derived = deriveAchievements(tipCount, streak);
    const newOnes = derived.filter((id) => !unlockedIds.includes(id));
    if (newOnes.length > 0) {
      const timeoutId = window.setTimeout(() => {
        const updated = [...unlockedIds, ...newOnes];
        setUnlockedIds(updated);
        saveUnlocked(updated);
        setNewAchievement(ACHIEVEMENTS[newOnes[0]]);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [tipCount, streak, unlockedIds]);

  const triggerAchievement = useCallback(
    (id: AchievementId) => {
      if (unlockedIds.includes(id)) return;
      const updated = [...unlockedIds, id];
      setUnlockedIds(updated);
      saveUnlocked(updated);
      setNewAchievement(ACHIEVEMENTS[id]);
    },
    [unlockedIds],
  );

  const dismissNotification = useCallback(() => {
    setNewAchievement(null);
  }, []);

  const unlocked = unlockedIds.map((id) => ACHIEVEMENTS[id]).filter(Boolean);

  return { unlockedIds, unlocked, newAchievement, triggerAchievement, dismissNotification };
}
