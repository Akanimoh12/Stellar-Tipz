import { useCallback } from 'react';

import { useProfileStore } from '../store/profileStore';
import { useContract } from './useContract';
import type { Profile } from '../types/contract';
import type { ProfileFormData } from '../types/profile';
import { logger } from '../services/logger';

/** The fields of ProfileFormData that map to contract Profile fields for optimistic overlay. */
function applyEditsToProfile(base: Profile, edits: Partial<ProfileFormData>): Profile {
  return {
    ...base,
    displayName: edits.displayName ?? base.displayName,
    bio: edits.bio ?? base.bio,
    imageUrl: edits.imageUrl ?? base.imageUrl,
    xHandle: edits.xHandle ?? base.xHandle,
  };
}

/**
 * Detects whether the server has written a new version of the profile while our
 * update was in-flight. A newer `updatedAt` from the server means someone else
 * (e.g. another device) committed a change concurrently.
 */
function hasConflict(knownUpdatedAt: number, serverProfile: Profile): boolean {
  return serverProfile.updatedAt > knownUpdatedAt;
}

export interface UseProfileUpdateResult {
  /**
   * Submit a profile update.  
   * - Applies an optimistic overlay immediately.  
   * - Submits the transaction.  
   * - Refetches the profile on success to obtain the confirmed on-chain state.  
   * - Rolls back and preserves `savedEdits` on failure.  
   * - Detects concurrent modifications and surfaces them via `updateStatus === 'conflict'`.
   *
   * @returns The transaction hash on success.
   * @throws Re-throws on unexpected errors so callers can surface them.
   */
  submitUpdate: (edits: Partial<ProfileFormData>, fullFormData: ProfileFormData) => Promise<string>;
  /** Dismiss an error and return to idle (edits remain in savedEdits). */
  resetError: () => void;
  /** Accept the server's version as ground truth and dismiss the conflict UI. */
  resolveConflict: () => void;
}

/**
 * Manages the full lifecycle of a profile update:
 *
 * 1. **Optimistic apply** – shows changes immediately (status: pending).
 * 2. **Submit guard** – blocks a second submit while one is in-flight.
 * 3. **On-chain confirmation** – status moves to confirming → confirmed.
 * 4. **Rollback on failure** – reverts the optimistic overlay; preserves
 *    `savedEdits` in the store so the form can re-populate without the user
 *    having to re-type anything.
 * 5. **Conflict detection** – if the server's `updatedAt` is newer than the
 *    value we snapshotted before submitting, surfaces a conflict instead of
 *    silently overwriting.
 */
export const useProfileUpdate = (): UseProfileUpdateResult => {
  const {
    profile,
    updateStatus,
    knownUpdatedAt,
    beginOptimisticUpdate,
    setConfirming,
    commitUpdate,
    rollbackUpdate,
    markConflict,
    resolveConflict: storeResolveConflict,
    resetUpdateStatus,
  } = useProfileStore();

  const { updateProfile, getProfile } = useContract();

  const submitUpdate = useCallback(
    async (edits: Partial<ProfileFormData>, fullFormData: ProfileFormData): Promise<string> => {
      if (!profile) {
        throw new Error('No profile loaded');
      }

      // ── Submit guard ────────────────────────────────────────────────────
      if (updateStatus === 'pending' || updateStatus === 'confirming') {
        throw new Error('An update is already in progress');
      }

      // Snapshot the current updatedAt so we can detect conflicts later.
      const snapshotUpdatedAt = profile.updatedAt;

      // ── Optimistic overlay ──────────────────────────────────────────────
      const optimisticProfile = applyEditsToProfile(profile, edits);
      beginOptimisticUpdate(optimisticProfile, fullFormData, snapshotUpdatedAt);

      logger.info('hooks/useProfileUpdate', 'Optimistic update applied', {
        username: profile.username,
      });

      try {
        // ── Transaction submission ────────────────────────────────────────
        setConfirming();
        const txHash = await updateProfile(edits);

        // ── Re-fetch confirmed on-chain state ────────────────────────────
        let confirmed: Profile;
        try {
          confirmed = await getProfile(profile.owner);
        } catch (_fetchErr) {
          // If the re-fetch fails we can still commit the optimistic version.
          // The next background poll will correct any drift.
          confirmed = optimisticProfile;
        }

        // ── Conflict detection ────────────────────────────────────────────
        // We stored knownUpdatedAt when we called beginOptimisticUpdate; read
        // the value we captured via the snapshot (safe: knownUpdatedAt in store
        // is set synchronously before any await).
        if (hasConflict(snapshotUpdatedAt, confirmed)) {
          logger.warn('hooks/useProfileUpdate', 'Concurrent modification detected', {
            username: profile.username,
            knownUpdatedAt: snapshotUpdatedAt,
            serverUpdatedAt: confirmed.updatedAt,
          });
          markConflict(confirmed);
          // We still return the tx hash so callers know the tx went through.
          return txHash as string;
        }

        commitUpdate(confirmed);
        logger.info('hooks/useProfileUpdate', 'Profile update committed', {
          txHash,
        });

        return txHash as string;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Profile update failed';

        // Don't treat "already in progress" as a rollback candidate – it means
        // we never even submitted the tx.
        if (message === 'An update is already in progress') {
          resetUpdateStatus();
          throw err;
        }

        rollbackUpdate(message);

        logger.error(
          'hooks/useProfileUpdate',
          'Profile update failed, rolled back',
          { username: profile.username },
          err instanceof Error ? err : new Error(String(err)),
        );

        throw err;
      }
    },
    [
      profile,
      updateStatus,
      beginOptimisticUpdate,
      setConfirming,
      commitUpdate,
      rollbackUpdate,
      markConflict,
      resetUpdateStatus,
      updateProfile,
      getProfile,
    ],
  );

  const resetError = useCallback(() => {
    resetUpdateStatus();
  }, [resetUpdateStatus]);

  const resolveConflict = useCallback(() => {
    storeResolveConflict();
  }, [storeResolveConflict]);

  return { submitUpdate, resetError, resolveConflict };
};
