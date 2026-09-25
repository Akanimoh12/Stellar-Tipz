/**
 * Search module types for creator discovery with relevance ranking.
 *
 * Issue #1266
 */

export interface SearchResult {
  userId: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  matchType: "exact" | "prefix" | "substring" | "fuzzy";
  relevanceScore: number;
  creditScore?: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  latencyMs: number;
}

export interface SearchQuery {
  query: string;
  page?: number;
  limit?: number;
}

export interface RelevanceTestFixtures {
  query: string;
  expectedOrder: string[]; // usernames in expected order
  description: string;
}
