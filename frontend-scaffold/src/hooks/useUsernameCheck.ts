import { useState, useEffect, useRef } from 'react';
import { useContract } from './useContract';
import { validateUsername } from '../helpers/validation';

export interface UseUsernameCheckResult {
  available: boolean | null;
  checking: boolean;
  error: string | null;
}

export const useUsernameCheck = (username: string): UseUsernameCheckResult => {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedUsername, setDebouncedUsername] = useState('');
  const cache = useRef<Map<string, boolean>>(new Map());
  const { getProfileByUsername } = useContract();

  // Debounce username input (500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUsername(username.trim());
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  // Reset state when username changes
  useEffect(() => {
    setAvailable(null);
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

    const checkAvailability = async () => {
      if (cache.current.has(debouncedUsername)) {
        setAvailable(cache.current.get(debouncedUsername)!);
        return;
      }

      setChecking(true);
      setError(null);

      try {
        await getProfileByUsername(debouncedUsername);
        // Profile found - username is taken
        cache.current.set(debouncedUsername, false);
        setAvailable(false);
      } catch (err) {
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
        setChecking(false);
      }
    };

    checkAvailability();
  }, [debouncedUsername, getProfileByUsername]);

  return {
    available,
    checking,
    error,
  };
};
