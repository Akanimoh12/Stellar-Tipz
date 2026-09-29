import { create } from 'zustand';

import { Profile } from '@/types/contract';
import type { ProfileFormData } from '@/types/profile';

/** Lifecycle state for a profile update operation. */
export type UpdateStatus =
  | 'idle'
  | 'pending'       // optimistic data applied locally, tx not yet submitted
  | 'confirming'    // tx submitted, waiting for on-chain confirmation
  | 'confirmed'     // tx confirmed on-chain
  | 'error'         // tx failed – saved edits preserved for retry
  | 'conflict';     // on-chain data changed while our update was in-flight

interface ProfileState {
  /** The authoritative profile from the contract (last confirmed on-chain state). */
  profile: Profile | null;
  /**
   * Optimistic overlay applied before the transaction confirms.
   * Merged on top of `profile` for display when non-null.
   */
  optimisticProfile: Profile | null;
  loading: boolean;
  error: string | null;
  /** Current lifecycle stage of a profile update. */
  updateStatus: UpdateStatus;
  /** Saved form edits preserved across a failure so the user can retry. */
  savedEdits: ProfileFormData | null;
  /**
   * The `updatedAt` timestamp we read from the contract just before submitting.
   * Used to detect concurrent modifications (conflict detection).
   */
  knownUpdatedAt: number | null;
  /** Error message from the last failed update (distinct from fetch errors). */
  updateError: string | null;
  /**
   * The server's profile version fetched during conflict resolution
   * (i.e. the state another device wrote while ours was in-flight).
   */
  conflictProfile: Profile | null;
}

interface ProfileActions {
  setProfile: (profile: Profile) => void;
  clearProfile: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // ── Optimistic update lifecycle ──────────────────────────────────────────
  /**
   * Immediately apply an optimistic overlay and record the form edits so they
   * can be rolled back on failure.
   */
  beginOptimisticUpdate: (
    optimistic: Profile,
    edits: ProfileFormData,
    knownUpdatedAt: number,
  ) => void;
  /** Move from pending → confirming once the tx has been submitted. */
  setConfirming: () => void;
  /** Commit a successful update: replace canonical profile, clear optimistic state. */
  commitUpdate: (confirmed: Profile) => void;
  /**
   * Roll back a failed update: clear the optimistic overlay, preserve saved
   * edits so the user can retry without re-typing.
   */
  rollbackUpdate: (errorMessage: string) => void;
  /** Record a concurrent-modification conflict. */
  markConflict: (serverProfile: Profile) => void;
  /** Resolve a conflict (user chose to keep or discard their changes). */
  resolveConflict: () => void;
  /** Reset update state back to idle without discarding the canonical profile. */
  resetUpdateStatus: () => void;
  /** Clear saved edits (e.g. after a successful retry or manual discard). */
  clearSavedEdits: () => void;
}

type ProfileStore = ProfileState & ProfileActions;

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,
  optimisticProfile: null,
  loading: false,
  error: null,
  updateStatus: 'idle',
  savedEdits: null,
  knownUpdatedAt: null,
  updateError: null,
  conflictProfile: null,

  // ── Fetch lifecycle ──────────────────────────────────────────────────────

  setProfile: (profile) =>
    set({ profile, loading: false, error: null }),

  clearProfile: () =>
    set({
      profile: null,
      optimisticProfile: null,
      loading: false,
      error: null,
      updateStatus: 'idle',
      savedEdits: null,
      knownUpdatedAt: null,
      updateError: null,
      conflictProfile: null,
    }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  // ── Optimistic update lifecycle ──────────────────────────────────────────

  beginOptimisticUpdate: (optimistic, edits, knownUpdatedAt) =>
    set({
      optimisticProfile: optimistic,
      savedEdits: edits,
      knownUpdatedAt,
      updateStatus: 'pending',
      updateError: null,
      conflictProfile: null,
    }),

  setConfirming: () =>
    set((state) =>
      state.updateStatus === 'pending' ? { updateStatus: 'confirming' } : state,
    ),

  commitUpdate: (confirmed) =>
    set({
      profile: confirmed,
      optimisticProfile: null,
      updateStatus: 'confirmed',
      savedEdits: null,
      knownUpdatedAt: null,
      updateError: null,
      conflictProfile: null,
    }),

  rollbackUpdate: (errorMessage) =>
    set({
      optimisticProfile: null,   // revert to canonical profile for display
      updateStatus: 'error',
      updateError: errorMessage,
      // savedEdits intentionally kept so the user can retry
    }),

  markConflict: (serverProfile) =>
    set({
      optimisticProfile: null,
      updateStatus: 'conflict',
      conflictProfile: serverProfile,
      // savedEdits kept so the user can compare / merge manually
    }),

  resolveConflict: () =>
    set((state) => ({
      profile: state.conflictProfile ?? state.profile,
      conflictProfile: null,
      updateStatus: 'idle',
      savedEdits: null,
      knownUpdatedAt: null,
      updateError: null,
    })),

  resetUpdateStatus: () =>
    set({
      updateStatus: 'idle',
      updateError: null,
      optimisticProfile: null,
    }),

  clearSavedEdits: () => set({ savedEdits: null }),
}));
