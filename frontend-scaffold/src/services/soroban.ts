// ⚡ TREE-SHAKING OPTIMIZED: Using named imports from @stellar/stellar-sdk
// This enables Vite's tree-shaking to eliminate unused code during build.
// Only these specific symbols are bundled, reducing Stellar SDK from ~500KB to ~150-200KB.
import {
  Contract,             // Soroban contract interaction
  nativeToScVal,        // Convert JS values to Soroban format
  SorobanRpc,           // Soroban RPC client
  TimeoutInfinite,      // Transaction timeout constant
  TransactionBuilder,   // Builder pattern for transactions
} from "@stellar/stellar-sdk";

import { logger } from "./logger";
import { NetworkDetails } from "../helpers/network";
import { LeaderboardEntry } from "../types/contract";
import {
  buildContractCacheKey,
  contractQueryCache,
} from "./cache";

// Re-export helpers from sub-modules for backward compatibility.
export {
  BASE_FEE,
  baseFeeXlm,
  getEstimatedFee,
} from "./soroban.fees";

export {
  accountToScVal,
  getTxBuilder,
  getSimulationTxBuilder,
  makePayment,
  numberToI128,
  simulateTx,
} from "./soroban.build";

export {
  SendTxStatus,
  submitTx,
} from "./soroban.submit";

// Keep BASE_FEE accessible locally for the leaderboard simulation helper.
import { BASE_FEE } from "./soroban.fees";
import { getSimulationTxBuilder, simulateTx } from "./soroban.build";

export const XLM_DECIMALS = 7;



/** Default TTL for leaderboard RPC cache (configurable via env). */
export const LEADERBOARD_CACHE_TTL_MS = Number(
  import.meta.env.VITE_LEADERBOARD_CACHE_TTL_MS ?? 60_000,
);

/** Default TTL for token metadata cache (symbol, name, decimals). */
export const TOKEN_METADATA_TTL_MS = Number(
  import.meta.env.VITE_TOKEN_METADATA_CACHE_TTL_MS ?? 3_600_000,
);

/** Default TTL for token balance cache. */
export const TOKEN_BALANCE_TTL_MS = Number(
  import.meta.env.VITE_TOKEN_BALANCE_CACHE_TTL_MS ?? 30_000,
);

/** Target max time for a leaderboard batch fetch (acceptance: load < 2s). */
export const LEADERBOARD_PERF_BUDGET_MS = 2_000;

/** Default page size for client-side leaderboard pagination. */
export const LEADERBOARD_DEFAULT_PAGE_SIZE = 25;

export interface LeaderboardFetchContext {
  contractId: string;
  network: string;
  networkPassphrase: string;
  sourcePublicKey: string;
  server: SorobanRpc.Server;
}

export interface LeaderboardPageSlice {
  items: LeaderboardEntry[];
  hasMore: boolean;
  nextOffset?: number;
}

let lastLeaderboardQueryMs = 0;

export const getLastLeaderboardQueryMs = (): number => lastLeaderboardQueryMs;

const recordLeaderboardQueryTime = (elapsedMs: number): void => {
  lastLeaderboardQueryMs = elapsedMs;
  if (elapsedMs > LEADERBOARD_PERF_BUDGET_MS) {
    logger.warn('services/soroban', `[leaderboard] Query took ${elapsedMs.toFixed(0)}ms (budget: ${LEADERBOARD_PERF_BUDGET_MS}ms)`);
  }
};

/**
 * Slice a full leaderboard batch for UI pagination (supports 1000+ cached entries).
 */
export const paginateLeaderboard = (
  entries: LeaderboardEntry[],
  offset: number,
  pageSize: number,
): LeaderboardPageSlice => {
  const items = entries.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize;
  return {
    items,
    hasMore: nextOffset < entries.length,
    nextOffset: nextOffset < entries.length ? nextOffset : undefined,
  };
};

/**
 * Merge refreshed leaderboard data without discarding already-loaded pages.
 */
export const mergeLeaderboardEntries = (
  previous: LeaderboardEntry[],
  incoming: LeaderboardEntry[],
): LeaderboardEntry[] => {
  if (incoming.length === 0) {
    return previous;
  }
  if (previous.length === 0) {
    return incoming;
  }

  const byAddress = new Map(previous.map((entry) => [entry.address, entry]));
  for (const entry of incoming) {
    byAddress.set(entry.address, entry);
  }

  const rankIndex = new Map(incoming.map((entry, index) => [entry.address, index]));
  return [...byAddress.values()].sort((a, b) => {
    const rankA = rankIndex.get(a.address);
    const rankB = rankIndex.get(b.address);
    if (rankA !== undefined && rankB !== undefined) {
      return rankA - rankB;
    }
    if (rankA !== undefined) {
      return -1;
    }
    if (rankB !== undefined) {
      return 1;
    }
    return Number(BigInt(b.totalTipsReceived) - BigInt(a.totalTipsReceived));
  });
};

export const invalidateLeaderboardCache = (): void => {
  contractQueryCache.invalidateAll();
};

const simulateLeaderboardBatch = async (
  ctx: LeaderboardFetchContext,
  limit: number,
): Promise<LeaderboardEntry[]> => {
  const contract = new Contract(ctx.contractId);
  const txBuilder = getSimulationTxBuilder(
    ctx.sourcePublicKey,
    BASE_FEE,
    ctx.networkPassphrase,
  );
  const tx = txBuilder
    .addOperation(
      contract.call(
        "get_leaderboard",
        nativeToScVal(limit, { type: "u32" }),
      ),
    )
    .setTimeout(TimeoutInfinite)
    .build();

  const startedAt = performance.now();
  const entries = await simulateTx<LeaderboardEntry[]>(tx, ctx.server);
  recordLeaderboardQueryTime(performance.now() - startedAt);
  return entries;
};

/**
 * Batch-fetch leaderboard entries in a single RPC call with TTL caching.
 * Pass `limit = 0` to request the full on-chain board (up to contract max).
 */
export const getLeaderboard = async (
  ctx: LeaderboardFetchContext,
  limit = 0,
): Promise<LeaderboardEntry[]> => {
  const cacheKey = buildContractCacheKey(
    "get_leaderboard",
    ctx.network,
    ctx.contractId,
    limit,
  );

  return contractQueryCache.getOrFetch(
    cacheKey,
    LEADERBOARD_CACHE_TTL_MS,
    () => simulateLeaderboardBatch(ctx, limit),
  );
};

export const RPC_URLS: { [key: string]: string } = {
  TESTNET: "https://soroban-testnet.stellar.org/",
  PUBLIC: "https://soroban-rpc.mainnet.stellar.gateway.fm/",
};

// Get a server configured for a specific network
export const getServer = (networkDetails: NetworkDetails) => {
  // Check for environment variable override first
  const envRpcUrl = import.meta.env.VITE_SOROBAN_RPC_URL;
  
  let rpcUrl: string;
  
  if (envRpcUrl) {
    rpcUrl = envRpcUrl;
    logger.info('services/soroban', `Using RPC URL from environment: ${rpcUrl}`);
  } else {
    rpcUrl = RPC_URLS[networkDetails.network];
    
    if (!rpcUrl) {
      logger.warn(
        'services/soroban',
        `No RPC URL configured for network: ${networkDetails.network}. ` +
        `Available networks: ${Object.keys(RPC_URLS).join(", ")}. ` +
        `Set VITE_SOROBAN_RPC_URL environment variable to override.`,
      );
      throw new Error(
        `RPC URL not found for network: ${networkDetails.network}. ` +
        `Please configure VITE_SOROBAN_RPC_URL or use a supported network.`
      );
    }
    
    logger.info('services/soroban', `Using default RPC URL for ${networkDetails.network}: ${rpcUrl}`);
  }
  
  return new SorobanRpc.Server(rpcUrl, {
    allowHttp: networkDetails.networkUrl.startsWith("http://"),
  });
};


// Get the tokens symbol, decoded as a string
export const getTokenSymbol = async (
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  return contractQueryCache.getOrFetch(
    buildContractCacheKey("symbol", tokenId),
    TOKEN_METADATA_TTL_MS,
    async () => {
      const contract = new Contract(tokenId);
      const tx = txBuilder
        .addOperation(contract.call("symbol"))
        .setTimeout(TimeoutInfinite)
        .build();
      return simulateTx<string>(tx, server);
    },
  );
};

// Get the tokens name, decoded as a string
export const getTokenName = async (
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  return contractQueryCache.getOrFetch(
    buildContractCacheKey("name", tokenId),
    TOKEN_METADATA_TTL_MS,
    async () => {
      const contract = new Contract(tokenId);
      const tx = txBuilder
        .addOperation(contract.call("name"))
        .setTimeout(TimeoutInfinite)
        .build();
      return simulateTx<string>(tx, server);
    },
  );
};

// Get the tokens decimals, decoded as a number
export const getTokenDecimals = async (
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  return contractQueryCache.getOrFetch(
    buildContractCacheKey("decimals", tokenId),
    TOKEN_METADATA_TTL_MS,
    async () => {
      const contract = new Contract(tokenId);
      const tx = txBuilder
        .addOperation(contract.call("decimals"))
        .setTimeout(TimeoutInfinite)
        .build();
      return simulateTx<number>(tx, server);
    },
  );
};

// Get the tokens balance, decoded as a string
export const getTokenBalance = async (
  address: string,
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  return contractQueryCache.getOrFetch(
    buildContractCacheKey("balance", tokenId, address),
    TOKEN_BALANCE_TTL_MS,
    async () => {
      const params = [accountToScVal(address)];
      const contract = new Contract(tokenId);
      const tx = txBuilder
        .addOperation(contract.call("balance", ...params))
        .setTimeout(TimeoutInfinite)
        .build();
      return simulateTx<string>(tx, server);
    },
  );
};

