import { useState, useEffect, useCallback } from 'react';

import { useWalletStore } from '../store/walletStore';
import { useProfileStore } from '../store/profileStore';
import { useContract } from './useContract';

/**
 * Determines whether a contract error indicates the user has no profile,
 * as opposed to a genuine network/contract failure.
 */
const isNotRegisteredError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.toLowerCase().includes('not found') ||
    msg.toLowerCase().includes('notfound') ||
    msg.toLowerCase().includes('not registered') ||
    msg.toLowerCase().includes('profile not found')
  );
};

/**
 * Manages the connected user's profile state.
 *
 * - Auto-fetches from the contract whenever the connected wallet's publicKey changes.
 * - Updates the profile store on a successful fetch.
 * - Clears the profile store when the wallet disconnects.
 * - Treats an unregistered address as isRegistered = false (no error state).
 */
export const useProfile = () => {
  const { publicKey } = useWalletStore();
  const { profile, loading, error, setProfile, clearProfile, setLoading, setError } = useProfileStore();
  const { getProfile } = useContract();

  const [isRegistered, setIsRegistered] = useState(false);

  const fetchProfile = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);

    try {
      const fetched = await getProfile(address);
      setProfile(fetched);
      setIsRegistered(true);
    } catch (err) {
      if (isNotRegisteredError(err)) {
        clearProfile();
        setIsRegistered(false);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch profile');
        setIsRegistered(false);
      }
    } finally {
      setLoading(false);
    }
  }, [getProfile, setProfile, clearProfile, setLoading, setError]);

  // Auto-fetch when the connected wallet changes; clear store on disconnect.
  useEffect(() => {
    if (publicKey) {
      fetchProfile(publicKey);
    } else {
      clearProfile();
      setIsRegistered(false);
    }
  }, [publicKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => {
    if (publicKey) {
      fetchProfile(publicKey);
    }
  }, [publicKey, fetchProfile]);

  return { profile, loading, error, isRegistered, refetch };
};
