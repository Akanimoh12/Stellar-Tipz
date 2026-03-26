import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { Profile } from '@/types';
import { useContract } from '@/hooks/useContract';
import Avatar from '@/components/ui/Avatar';
import { truncateString } from '@/helpers/format';

interface CreatorSearchProps {
  onSelect: (profile: Profile) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 300;

const isValidStellarAddress = (input: string): boolean =>
  input.startsWith('G') && input.length === 56;

const CreatorSearch: React.FC<CreatorSearchProps> = ({
  onSelect,
  placeholder = 'Search by username or Stellar address...',
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { getProfile, getProfileByUsername } = useContract();

  const performSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      setIsLoading(true);
      setHasSearched(true);

      try {
        let profile: Profile | null = null;

        if (isValidStellarAddress(trimmed)) {
          try {
            profile = await getProfile(trimmed);
          } catch {
            // Not found by address
          }
        } else {
          try {
            profile = await getProfileByUsername(trimmed);
          } catch {
            // Not found by username
          }
        }

        setResults(profile ? [profile] : []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [getProfile, getProfileByUsername],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query);
      setShowDropdown(true);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, performSearch]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (profile: Profile) => {
    onSelect(profile);
    setQuery('');
    setShowDropdown(false);
    setResults([]);
    setHasSearched(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim()) setShowDropdown(true);
          }}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Searching...
            </div>
          ) : results.length > 0 ? (
            results.map((profile) => (
              <button
                key={profile.owner}
                onClick={() => handleSelect(profile)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <Avatar alt={profile.displayName || profile.username} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {profile.displayName || profile.username}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    @{profile.username} · {truncateString(profile.owner)}
                  </p>
                </div>
              </button>
            ))
          ) : hasSearched ? (
            <div className="py-6 text-center text-gray-400 text-sm">
              No results found
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default CreatorSearch;
