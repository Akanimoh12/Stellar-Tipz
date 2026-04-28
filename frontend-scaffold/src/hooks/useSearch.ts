import { useState, useEffect, useCallback, useRef } from "react";
import Fuse, { IFuseOptions } from "fuse.js";
import type { Profile } from "../types";
import { useContract } from "./useContract";
import { env } from "../helpers/env";
import { mockLeaderboard } from "../features/mockData";

const DEBOUNCE_MS = 300;
const RECENT_SEARCHES_KEY = "stellar_tipz_recent_searches";
const MAX_RECENT = 5;

interface FuseMatch {
  indices: [number, number][];
  key: string;
  value?: string;
}

interface SearchResult {
  item: Profile;
  matches?: FuseMatch[];
}

interface RecentSearch {
  owner: string;
  username: string;
  displayName: string;
  xHandle: string;
  creditScore: number;
}

function loadRecentSearches(): Profile[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as RecentSearch[];
    return parsed.map((p) => ({
      owner: p.owner,
      username: p.username,
      displayName: p.displayName,
      bio: "",
      imageUrl: "",
      xHandle: p.xHandle || "",
      xFollowers: 0,
      xEngagementAvg: 0,
      creditScore: p.creditScore || 0,
      totalTipsReceived: "0",
      totalTipsCount: 0,
      balance: "0",
      registeredAt: 0,
      updatedAt: 0,
    }));
  } catch {
    return [];
  }
}

function saveRecentSearches(profiles: Profile[]): void {
  try {
    const toSave: RecentSearch[] = profiles.map((p) => ({
      owner: p.owner,
      username: p.username,
      displayName: p.displayName,
      xHandle: p.xHandle || "",
      creditScore: p.creditScore || 0,
    }));
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(toSave));
  } catch {
    // Silently fail
  }
}

const fuseOptions: IFuseOptions<Profile> = {
  keys: ["username", "displayName", "xHandle", "owner"],
  threshold: 0.3,
  includeMatches: true,
  includeScore: true,
  minMatchCharLength: 1,
  ignoreLocation: true,
};

export const useSearch = () => {
  const { getLeaderboard, getProfile } = useContract();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<Profile[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const fuseRef = useRef<Fuse<Profile> | null>(null);
  const allProfilesRef = useRef<Profile[]>([]);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  const fetchProfiles = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (env.useMockData || !env.contractId) {
        const profiles: Profile[] = mockLeaderboard.map((entry) => ({
          owner: entry.address,
          username: entry.username,
          displayName: entry.username,
          bio: "",
          imageUrl: "",
          xHandle: "",
          xFollowers: 0,
          xEngagementAvg: 0,
          creditScore: entry.creditScore,
          totalTipsReceived: entry.totalTipsReceived,
          totalTipsCount: 0,
          balance: "0",
          registeredAt: 0,
          updatedAt: 0,
        }));
        allProfilesRef.current = profiles;
        fuseRef.current = new Fuse(profiles, fuseOptions);
      } else {
        const leaderboard = await getLeaderboard(50);
        const profilePromises = leaderboard.map((entry) =>
          getProfile(entry.address).catch(() => null as Profile | null),
        );
        const profileResults = await Promise.all(profilePromises);
        const profiles = profileResults.filter((p): p is Profile => p !== null);
        allProfilesRef.current = profiles;
        fuseRef.current = new Fuse(profiles, fuseOptions);
      }
    } catch (err) {
      console.error("Failed to fetch profiles for search:", err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [getLeaderboard, getProfile]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const performSearch = useCallback(
    (searchQuery: string) => {
      const trimmed = searchQuery.trim();

      if (!trimmed) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      setHasSearched(true);
      setIsLoading(true);

      if (!fuseRef.current) {
        setIsLoading(false);
        return;
      }

      const fuseResults = fuseRef.current.search(trimmed, { limit: 10 });

      const searchResults: SearchResult[] = fuseResults.map((result) => ({
        item: result.item,
        matches: result.matches
          ? result.matches.map((m) => ({
              indices: m.indices as [number, number][],
              key: m.key || "",
            }))
          : undefined,
      }));

      setResults(searchResults);
      setIsLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, performSearch]);

  const addToRecent = useCallback(
    (profile: Profile) => {
      const updated = [
        profile,
        ...recentSearches.filter((p) => p.owner !== profile.owner),
      ].slice(0, MAX_RECENT);

      setRecentSearches(updated);
      saveRecentSearches(updated);
    },
    [recentSearches],
  );

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    recentSearches,
    addToRecent,
    clearRecent,
    hasSearched,
  };
};
