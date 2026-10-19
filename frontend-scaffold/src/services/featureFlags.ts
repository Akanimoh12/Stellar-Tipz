export type FlagValue = boolean | number | string;

interface FlagDefinition {
  defaultValue: FlagValue;
  description?: string;
}

type FlagDefinitions = Record<string, FlagDefinition>;

type Flags = Record<string, FlagValue>;

export interface FlagServiceConfig {
  endpoint: string;
  cacheTtlMs?: number;
  userId?: string;
}

export interface FlagDebugInfo {
  envFlags: Flags;
  remoteFlags: Flags;
  cacheAge: number | null;
  userId: string | null;
  lastFetchError: string | null;
  lastFetchTime: number | null;
}

const FLAG_PREFIX = 'VITE_FLAG_';
const CACHE_KEY = 'tipz_flags_cache';
const CACHE_TS_KEY = 'tipz_flags_cache_ts';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

const defaultFlags: FlagDefinitions = {};

const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

function loadFlagsFromEnv(): Flags {
  const flags: Flags = {};
  for (const [key, value] of Object.entries(viteEnv)) {
    if (key.startsWith(FLAG_PREFIX) && value !== undefined) {
      const flagName = key.slice(FLAG_PREFIX.length).replace(/_/g, '.').toLowerCase();
      flags[flagName] = parseFlagValue(value);
    }
  }
  return flags;
}

function parseFlagValue(value: string): FlagValue {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

const envFlags = loadFlagsFromEnv();

let remoteFlags: Flags = {};
let serviceConfig: FlagServiceConfig | null = null;
let lastFetchError: string | null = null;
let lastFetchTime: number | null = null;

const changeListeners = new Set<(name?: string) => void>();

function notifyListeners(name?: string): void {
  changeListeners.forEach((fn) => fn(name));
}

function loadCachedFlags(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      remoteFlags = JSON.parse(raw) as Flags;
      const ts = localStorage.getItem(CACHE_TS_KEY);
      if (ts) lastFetchTime = Number(ts);
    }
  } catch {
    // cache corrupt — proceed with empty remote flags
  }
}

function writeFlagsToCache(flags: Flags): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(flags));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch {
    // storage full — non-critical
  }
}

export async function fetchFlags(): Promise<void> {
  if (!serviceConfig) return;
  try {
    const url = new URL(serviceConfig.endpoint);
    if (serviceConfig.userId) {
      url.searchParams.set('userId', serviceConfig.userId);
    }
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Flags;
    remoteFlags = { ...data };
    lastFetchTime = Date.now();
    lastFetchError = null;
    writeFlagsToCache(data);
    notifyListeners();
  } catch (err) {
    lastFetchError = err instanceof Error ? err.message : String(err);
    // On failure, remote flags stay as whatever was loaded from cache
  }
}

export function initFlagService(config: FlagServiceConfig): void {
  serviceConfig = config;
  loadCachedFlags();
  void fetchFlags();
}

export function refreshFlags(): Promise<void> {
  return fetchFlags();
}

export function setRemoteFlags(flags: Flags): void {
  remoteFlags = { ...flags };
  notifyListeners();
}

export function setUserId(userId: string | undefined): void {
  if (serviceConfig) {
    serviceConfig.userId = userId;
  }
}

export function getFlag(name: string): FlagValue | undefined {
  if (name in envFlags) return envFlags[name];
  if (name in remoteFlags) return remoteFlags[name];
  return undefined;
}

export function isFeatureEnabled(name: string, defaultValue: boolean = false): boolean {
  const value = getFlag(name);
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  if (typeof value === 'number') return value !== 0;
  return Boolean(value);
}

export function getFeatureValue(name: string, defaultValue?: FlagValue): FlagValue | undefined {
  return getFlag(name) ?? defaultValue;
}

export function registerFlags(definitions: FlagDefinitions): void {
  Object.assign(defaultFlags, definitions);
}

export function subscribeToFlagChanges(callback: (name?: string) => void): () => void {
  changeListeners.add(callback);
  return () => { changeListeners.delete(callback); };
}

export function getFlagDebugInfo(): FlagDebugInfo {
  const cacheTs = lastFetchTime;
  return {
    envFlags: { ...envFlags },
    remoteFlags: { ...remoteFlags },
    cacheAge: cacheTs !== null ? Date.now() - cacheTs : null,
    userId: serviceConfig?.userId ?? null,
    lastFetchError,
    lastFetchTime,
  };
}

export { DEFAULT_CACHE_TTL_MS };
