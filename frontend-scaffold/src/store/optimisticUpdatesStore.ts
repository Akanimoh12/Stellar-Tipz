import { create } from 'zustand';
import { Tip } from '../types/contract';

interface OptimisticTip extends Tip {
  clientId: string;
  isOptimistic: true;
  transactionId: string;
}

interface OptimisticUpdate {
  id: string;
  type: 'tip';
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  data: OptimisticTip;
  error?: string;
}

interface OptimisticStore {
  updates: Map<string, OptimisticUpdate>;
  addOptimisticUpdate: (update: OptimisticUpdate) => void;
  confirmUpdate: (id: string) => void;
  failUpdate: (id: string, error: string) => void;
  removeUpdate: (id: string) => void;
  getUpdatesByType: (type: 'tip') => OptimisticUpdate[];
  cleanup: () => void;
}

const OPTIMISTIC_CLEANUP_TIME = 5 * 60 * 1000; // 5 minutes

export const useOptimisticStore = create<OptimisticStore>((set, get) => ({
  updates: new Map(),

  addOptimisticUpdate: (update) => {
    set((state) => {
      const newUpdates = new Map(state.updates);
      newUpdates.set(update.id, update);
      return { updates: newUpdates };
    });

    // Auto-cleanup after timeout
    setTimeout(() => {
      const state = get();
      const update = state.updates.get(update.id);
      if (update && update.status !== 'confirmed') {
        state.removeUpdate(update.id);
      }
    }, OPTIMISTIC_CLEANUP_TIME);
  },

  confirmUpdate: (id) => {
    set((state) => {
      const update = state.updates.get(id);
      if (!update) return state;

      const newUpdates = new Map(state.updates);
      newUpdates.set(id, { ...update, status: 'confirmed' });
      return { updates: newUpdates };
    });
  },

  failUpdate: (id, error) => {
    set((state) => {
      const update = state.updates.get(id);
      if (!update) return state;

      const newUpdates = new Map(state.updates);
      newUpdates.set(id, { ...update, status: 'failed', error });
      return { updates: newUpdates };
    });
  },

  removeUpdate: (id) => {
    set((state) => {
      const newUpdates = new Map(state.updates);
      newUpdates.delete(id);
      return { updates: newUpdates };
    });
  },

  getUpdatesByType: (type) => {
    return Array.from(get().updates.values()).filter((u) => u.type === type);
  },

  cleanup: () => {
    const now = Date.now();
    set((state) => {
      const newUpdates = new Map(state.updates);
      Array.from(newUpdates.entries()).forEach(([id, update]) => {
        if (
          update.status === 'confirmed' &&
          now - update.timestamp > OPTIMISTIC_CLEANUP_TIME
        ) {
          newUpdates.delete(id);
        }
      });
      return { updates: newUpdates };
    });
  },
}));
