import { useState, useEffect, useRef } from 'react';
import { useContract } from './useContract';
import { validateUsername } from '../helpers/validation';

export interface UseUsernameCheckResult {
  available: boolean | null;
  checking: boolean;
  error: string | null;
}

export const DEFAULT_USERNAME_DEBOUNCE_MS = 500;

export const useUsernameCheck = (
  username: string,
  delayMs: number = DEFAULT_USERNAME_DEBOUNCE_MS,
): UseUsernameCheckResult => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedUsername, setDebouncedUsername] = useState('');
  const cache = useRef<Map<string, boolean>>(new Map());
  const requestIdRef = useRef(0);
  const { getProfileByUsername } = useContract();

  // Debounce username input to avoid a request on every keystroke
  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setDebouncedUsername('');
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedUsername(trimmed);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [username, delayMs]);

  // Reset state immediately when username changes
  useEffect(() => {
    requestIdRef.current += 1;
    setAvailable(null);
    setChecking(false);
    setError(null);
  }, [username]);

  // Check username availability
  useEffect(() => {
    if (!debouncedUsername) {
      setAvailable(null);
      setChecking(false);
      setError(null);
      return;
    }

    // First run local validation
    const validation = validateUsername(debouncedUsername);
    if (!validation.valid) {
      setAvailable(null);
      setChecking(false);
      setError(null);
      return;
    }

    if (cache.current.has(debouncedUsername)) {
      setAvailable(cache.current.get(debouncedUsername)!);
      setChecking(false);
      return;
    }

    let cancelled = false;
    const currentRequestId = ++requestIdRef.current;

    const checkAvailability = async () => {
      setChecking(true);
      setError(null);

      try {
        await getProfileByUsername(debouncedUsername);
        if (cancelled || currentRequestId !== requestIdRef.current) return;
        // Profile found - username is taken
        cache.current.set(debouncedUsername, false);
        setAvailable(false);
      } catch (err) {
        if (cancelled || currentRequestId !== requestIdRef.current) return;
        // Profile not found or other error
        // Check if it's a "not found" error vs network error
        if (err && typeof err === 'object' && 'message' in err) {
          const errorMessage = String(err.message);
          
          // Common Stellar/Soroban error patterns for "not found"
          if (
            errorMessage.includes('not found') ||
            errorMessage.includes('No profile found') ||
            errorMessage.includes('invalid input') ||
            errorMessage.includes('No data')
          ) {
            // Username is available
            cache.current.set(debouncedUsername, true);
            setAvailable(true);
          } else {
            // Network or other error - show warning
            setError('Unable to check availability. Please try again.');
            setAvailable(null);
          }
        } else {
          // Unknown error - assume available but show warning
          setError('Network issue. Availability may not be accurate.');
          setAvailable(null);
        }
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setChecking(false);
        }
      }
    };

    void checkAvailability();

    return () => {
      cancelled = true;
    };
  }, [debouncedUsername, getProfileByUsername]);

  return {
    available,
    checking,
    error,
  };
};
