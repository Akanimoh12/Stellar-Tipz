/**
 * Search service with relevance ranking and typo tolerance.
 *
 * Features:
 * - Exact username match always ranks first
 * - Prefix matches rank above substring matches
 * - Basic typo tolerance using PostgreSQL pg_trgm similarity
 * - Credit score as tiebreaker
 * - Performance monitoring with latency budget
 *
 * Issue #1266
 */

import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/utils/logger.js";
import { computeCreditScore } from "../credit/credit.service.js";
import type { SearchResult, SearchResponse, SearchQuery } from "./search.types.js";

// ── Configuration ─────────────────────────────────────────────────────────────

/** Cache TTL for search results in seconds */
export const SEARCH_CACHE_TTL_SECONDS = 300; // 5 minutes

/** Maximum latency budget for search in milliseconds */
export const SEARCH_LATENCY_BUDGET_MS = 500;

/** Minimum similarity threshold for fuzzy matching (0-1) */
const FUZZY_SIMILARITY_THRESHOLD = 0.3;

/** Relevance score weights */
const RELEVANCE_WEIGHTS = {
  exact: 100,
  prefix: 80,
  substring: 60,
  fuzzy: 40,
} as const;

// ── Relevance ranking helpers ───────────────────────────────────────────────────

/**
 * Computes match type and base relevance score for a username against a query.
 */
function computeMatchTypeAndScore(username: string | null, query: string): {
  matchType: SearchResult["matchType"];
  baseScore: number;
} {
  if (!username) {
    return { matchType: "substring", baseScore: 0 };
  }

  const lowerUsername = username.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match (case-insensitive)
  if (lowerUsername === lowerQuery) {
    return { matchType: "exact", baseScore: RELEVANCE_WEIGHTS.exact };
  }

  // Prefix match
  if (lowerUsername.startsWith(lowerQuery)) {
    return { matchType: "prefix", baseScore: RELEVANCE_WEIGHTS.prefix };
  }

  // Substring match
  if (lowerUsername.includes(lowerQuery)) {
    return { matchType: "substring", baseScore: RELEVANCE_WEIGHTS.substring };
  }

  // Fuzzy match (handled by SQL trigram similarity)
  return { matchType: "fuzzy", baseScore: RELEVANCE_WEIGHTS.fuzzy };
}

/**
 * Computes final relevance score combining match type and credit score.
 */
function computeFinalRelevance(
  baseScore: number,
  creditScore: number | undefined,
): number {
  // Credit score contributes up to 20 points as tiebreaker
  const creditBonus = creditScore ? (creditScore / 100) * 20 : 0;
  return baseScore + creditBonus;
}

// ── Main search function ───────────────────────────────────────────────────────

/**
 * Searches for creators with relevance ranking and typo tolerance.
 *
 * Uses PostgreSQL pg_trgm extension for fuzzy matching when exact/prefix/substring
 * matches don't yield sufficient results.
 *
 * @param query - Search query string
 * @param page - Page number (1-indexed)
 * @param limit - Results per page
 * @returns SearchResponse with ranked results and latency metrics
 */
export async function searchCreators(
  query: string,
  page = 1,
  limit = 20,
): Promise<SearchResponse> {
  const startTime = Date.now();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      query: trimmedQuery,
      results: [],
      total: 0,
      page,
      limit,
      latencyMs: Date.now() - startTime,
    };
  }

  logger.info({ query: trimmedQuery, page, limit }, "Executing search");

  try {
    // Step 1: Find exact and prefix matches (highest priority)
    const exactAndPrefixMatches = await prisma.user.findMany({
      where: {
        OR: [
          { username: { equals: trimmedQuery, mode: "insensitive" } },
          { username: { startsWith: trimmedQuery, mode: "insensitive" } },
          { displayName: { contains: trimmedQuery, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        stellarAddress: true,
        username: true,
        displayName: true,
      },
    });

    // Step 2: If we need more results, use fuzzy matching with pg_trgm
    let fuzzyMatches: any[] = [];
    if (exactAndPrefixMatches.length < limit * page) {
      try {
        fuzzyMatches = await prisma.$queryRaw`
          SELECT 
            id, 
            "stellarAddress", 
            username, 
            "displayName",
            similarity(username, ${trimmedQuery}) as sim
          FROM "User"
          WHERE 
            username IS NOT NULL
            AND similarity(username, ${trimmedQuery}) >= ${FUZZY_SIMILARITY_THRESHOLD}
            AND id NOT IN (${exactAndPrefixMatches.map((u) => u.id)})
          ORDER BY sim DESC
          LIMIT ${limit * 2}
        `;
      } catch (error) {
        // pg_trgm might not be enabled - log and continue without fuzzy matches
        logger.warn({ error }, "pg_trgm extension not available, skipping fuzzy search");
      }
    }

    // Combine and deduplicate results
    const allResults = [...exactAndPrefixMatches, ...fuzzyMatches];

    // Compute relevance scores for each result
    const scoredResults: (SearchResult & { creditScore?: number })[] = await Promise.all(
      allResults.map(async (user: any) => {
        const { matchType, baseScore } = computeMatchTypeAndScore(
          user.username,
          trimmedQuery,
        );

        // Fetch credit score for tiebreaking
        let creditScore: number | undefined;
        try {
          const creditResult = await computeCreditScore(user.id, {
            tipsSent: 0,
            tipsReceived: 0,
            streak: 0,
            xFollowers: 0,
            xEngagement: null,
            selfTips: 0,
            washTipRatio: 0,
          });
          creditScore = creditResult.score;
        } catch {
          // Credit score computation failed - continue without it
        }

        return {
          userId: user.id,
          stellarAddress: user.stellarAddress,
          username: user.username,
          displayName: user.displayName,
          matchType,
          relevanceScore: computeFinalRelevance(baseScore, creditScore),
          creditScore,
        };
      }),
    );

    // Sort by relevance score (descending), then by credit score
    scoredResults.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return (b.creditScore ?? 0) - (a.creditScore ?? 0);
    });

    // Paginate
    const total = scoredResults.length;
    const skip = (page - 1) * limit;
    const paginatedResults = scoredResults.slice(skip, skip + limit);

    const latencyMs = Date.now() - startTime;

    // Log if latency exceeds budget
    if (latencyMs > SEARCH_LATENCY_BUDGET_MS) {
      logger.warn(
        { query: trimmedQuery, latencyMs, budget: SEARCH_LATENCY_BUDGET_MS },
        "Search exceeded latency budget",
      );
    }

    return {
      query: trimmedQuery,
      results: paginatedResults,
      total,
      page,
      limit,
      latencyMs,
    };
  } catch (error) {
    logger.error({ query: trimmedQuery, error }, "Search failed");
    throw error;
  }
}

/**
 * Simple search wrapper for backward compatibility.
 */
export async function search(query: SearchQuery): Promise<SearchResponse> {
  return searchCreators(query.query, query.page, query.limit);
}
