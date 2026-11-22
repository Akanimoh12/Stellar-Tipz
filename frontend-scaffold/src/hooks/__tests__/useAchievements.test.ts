import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useAchievements,
  deriveAchievements,
  ACHIEVEMENTS,
  type AchievementId,
} from "../useAchievements";

const STORAGE_KEY = "tipz-achievements";
const DATES_KEY = "tipz-achievement-dates";
const LONGEST_STREAK_KEY = "tipz-longest-streak";

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DATES_KEY);
  localStorage.removeItem(LONGEST_STREAK_KEY);
}

describe("useAchievements", () => {
  beforeEach(() => {
    clearStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearStorage();
  });

  describe("initial state", () => {
    it("returns empty unlocked state with no new achievement", () => {
      const { result } = renderHook(() => useAchievements());
      expect(result.current.unlockedIds).toEqual([]);
      expect(result.current.unlocked).toEqual([]);
      expect(result.current.unlockedAt).toEqual({});
      expect(result.current.longestStreak).toBe(0);
      expect(result.current.newAchievement).toBeNull();
    });
  });

  describe("deriveAchievements", () => {
    it("unlocks first_tip at 1 tip", () => {
      expect(deriveAchievements(1, 0)).toContain("first_tip");
    });

    it("unlocks ten_tips at 10 tips", () => {
      expect(deriveAchievements(10, 0)).toContain("ten_tips");
    });

    it("unlocks hundred_tips at 100 tips", () => {
      expect(deriveAchievements(100, 0)).toContain("hundred_tips");
    });

    it("unlocks streak achievements at streak thresholds", () => {
      expect(deriveAchievements(0, 3)).toContain("streak_3");
      expect(deriveAchievements(0, 7)).toContain("streak_7");
      expect(deriveAchievements(0, 30)).toContain("streak_30");
    });

    it("does not unlock anything at zero tips and zero streak", () => {
      expect(deriveAchievements(0, 0)).toEqual([]);
    });
  });

  describe("triggerAchievement (success)", () => {
    it("unlocks an achievement, records its timestamp, sets newAchievement, and persists to localStorage", () => {
      const { result } = renderHook(() => useAchievements({ tipCount: 0, streak: 0 }));

      act(() => {
        result.current.triggerAchievement("first_tip");
      });

      expect(result.current.unlockedIds).toContain("first_tip");
      expect(result.current.newAchievement?.id).toBe("first_tip");
      expect(result.current.unlockedAt["first_tip"]).toBeDefined();
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toContain(
        "first_tip",
      );
      expect(
        JSON.parse(localStorage.getItem(DATES_KEY)!)[
          "first_tip"
        ],
      ).toBeDefined();
    });

    it("exposes the full achievement object for unlocked ids", () => {
      const { result } = renderHook(() => useAchievements());

      act(() => {
        result.current.triggerAchievement("ten_tips");
      });

      expect(result.current.unlocked).toHaveLength(1);
      expect(result.current.unlocked[0].id).toBe("ten_tips");
      expect(result.current.unlocked[0].label).toBe(
        ACHIEVEMENTS.ten_tips.label,
      );
    });

    it("does not re-unlock an already unlocked achievement", () => {
      const { result } = renderHook(() => useAchievements());

      act(() => {
        result.current.triggerAchievement("first_tip");
      });

      const before = result.current.unlockedIds.length;

      act(() => {
        result.current.triggerAchievement("first_tip");
      });

      expect(result.current.unlockedIds.length).toBe(before);
    });
  });

  describe("dismissNotification (cleanup)", () => {
    it("clears the new achievement notification", () => {
      const { result } = renderHook(() => useAchievements());

      act(() => {
        result.current.triggerAchievement("first_tip");
      });
      expect(result.current.newAchievement).not.toBeNull();

      act(() => {
        result.current.dismissNotification();
      });
      expect(result.current.newAchievement).toBeNull();
    });
  });

  describe("derivation from props (success)", () => {
    it("unlocks new achievements derived from tipCount and streak", () => {
      const { result } = renderHook(() =>
        useAchievements({ tipCount: 10, streak: 5 }),
      );

      expect(result.current.unlockedIds).toContain("first_tip");
      expect(result.current.unlockedIds).toContain("ten_tips");
      expect(result.current.unlockedIds).toContain("streak_3");
      expect(result.current.newAchievement?.id).toBe("first_tip");
    });
  });
});
