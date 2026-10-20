import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Goal } from '@/types/contract';

interface GoalState {
  goals: Goal[];
  setGoal: (goal: Goal) => void;
  updateGoalProgress: (creatorAddress: string, raisedAmount: string, supporters: number) => void;
  getCreatorGoal: (creatorAddress: string) => Goal | undefined;
  removeGoal: (creatorAddress: string) => void;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set, get) => ({
      goals: [],

      setGoal: (goal) =>
        set((state) => {
          const existing = state.goals.findIndex((g) => g.creator === goal.creator);
          if (existing >= 0) {
            const updated = [...state.goals];
            updated[existing] = { ...updated[existing], ...goal };
            return { goals: updated };
          }
          return { goals: [...state.goals, goal] };
        }),

      updateGoalProgress: (creatorAddress, raisedAmount, supporters) =>
        set((state) => ({
          goals: state.goals.map((g) =>
            g.creator === creatorAddress && g.active
              ? { ...g, raisedAmount, supporters }
              : g,
          ),
        })),

      getCreatorGoal: (creatorAddress) =>
        get().goals.find((g) => g.creator === creatorAddress && g.active),

      removeGoal: (creatorAddress) =>
        set((state) => ({
          goals: state.goals.filter((g) => g.creator !== creatorAddress),
        })),
    }),
    {
      name: 'tipz_goals',
      version: 1,
      partialize: (state) => ({ goals: state.goals }),
      migrate: (persistedState: unknown, version: number) => {
        if (version !== 1 || !persistedState || typeof persistedState !== 'object') {
          return { goals: [] };
        }
        return persistedState as { goals: Goal[] };
      },
    },
  ),
);
