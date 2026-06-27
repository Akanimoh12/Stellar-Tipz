import { SorobanRpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { config } from '../config/index.js';
import { logger } from '../common/utils/logger.js';

/** Page size requested per `getEvents` call. */
export const EVENTS_PAGE_SIZE = 100;

/** A Soroban contract event decoded into JSON-safe primitives. */
export interface DecodedEvent {
  ledger: number;
  txHash: string;
  pagingToken: string;
  topic: string;
  value: unknown;
}

/** A single page of decoded events plus the chain head reported by the RPC. */
export interface EventPage {
  events: DecodedEvent[];
  latestLedger: number;
}

let server: SorobanRpc.Server | null = null;

function getServer(): SorobanRpc.Server {
  if (!server) {
    server = new SorobanRpc.Server(config.stellar.rpcUrl, {
      allowHttp: config.stellar.rpcUrl.startsWith('http://'),
    });
  }
  return server;
}

/** Current ledger sequence at the chain head. */
export async function getLatestLedger(): Promise<number> {
  const { sequence } = await getServer().getLatestLedger();
  return sequence;
}

/**
 * Fetch one page of contract events. Pass `pagingToken` to continue from a
 * previous page; otherwise events are read from `startLedger` forward.
 */
export async function getEventsFrom(startLedger: number, pagingToken?: string): Promise<EventPage> {
  const contractId = config.stellar.contractId;
  const filters = contractId ? [{ type: 'contract' as const, contractIds: [contractId], topics: [] }] : [];

  const request = pagingToken
    ? { filters, cursor: pagingToken, limit: EVENTS_PAGE_SIZE }
    : { filters, startLedger, limit: EVENTS_PAGE_SIZE };

  const res = await getServer().getEvents(request);

  return {
    latestLedger: res.latestLedger,
    events: res.events.map((e) => ({
      ledger: e.ledger,
      txHash: e.txHash,
      pagingToken: e.pagingToken,
      topic: decodeTopic(e.topic),
      value: decodeValue(e.value),
    })),
  };
}

/** First topic of an event, decoded to its symbol/string name. */
function decodeTopic(topic: xdr.ScVal[]): string {
  const first = topic[0];
  if (!first) return 'unknown';
  try {
    const native = scValToNative(first);
    return typeof native === 'string' ? native : String(native);
  } catch {
    return 'unknown';
  }
}

/** Event value decoded to JSON-safe primitives (BigInt -> decimal string). */
function decodeValue(value: xdr.ScVal): unknown {
  try {
    return toJsonSafe(scValToNative(value));
  } catch (err) {
    logger.warn({ err }, 'Failed to decode event value');
    return null;
  }
}

/** Recursively convert BigInt values to strings so the result is JSON-serializable. */
function toJsonSafe(input: unknown): unknown {
  if (typeof input === 'bigint') return input.toString();
  if (Array.isArray(input)) return input.map(toJsonSafe);
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, val]) => [key, toJsonSafe(val)]),
    );
  }
  return input;
}
