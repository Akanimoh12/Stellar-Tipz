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
 * The hash of ledger `sequence` as the chain currently reports it, via
 * Horizon `/ledgers/{sequence}` (issue #1257 — reorg detection compares a
 * stored hash against this). `null` when Horizon has no such ledger (pruned
 * history, or a sequence beyond the head).
 */
export async function getLedgerHash(sequence: number): Promise<string | null> {
  const base = config.stellar.horizonUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/ledgers/${sequence}`, {
    headers: { accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Horizon /ledgers/${sequence} returned ${res.status}`);
  }
  const body = (await res.json()) as { hash?: unknown };
  return typeof body.hash === 'string' ? body.hash : null;
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

/**
 * Decode an event's full topic tuple into a single canonical name.
 *
 * Contract events use a two-symbol topic tuple — e.g. `("profile", "register")`
 * or `("goal", "set")`. Joining every symbol with `_` (→ `profile_register`,
 * `goal_set`) preserves the sub-type so projections can distinguish, for
 * example, a profile registration from a profile update. A single-symbol topic
 * decodes to just that symbol.
 */
function decodeTopic(topic: xdr.ScVal[]): string {
  if (topic.length === 0) return 'unknown';
  try {
    return topic
      .map((part) => {
        const native = scValToNative(part);
        return typeof native === 'string' ? native : String(native);
      })
      .join('_');
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
