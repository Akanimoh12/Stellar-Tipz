type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  sessionId: string;
  error?: Error;
}

interface LoggerConfig {
  minLevel: LogLevel;
  remoteEndpoint: string;
}

// Stable session identifier for the lifetime of the page load.
const SESSION_ID: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Read Vite env vars without hard-coding import.meta.env everywhere.
const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const resolveMinLevel = (): LogLevel => {
  const fromEnv = viteEnv.VITE_LOG_LEVEL as LogLevel | undefined;
  if (fromEnv && fromEnv in LEVEL_RANK) return fromEnv;
  return viteEnv.MODE === 'development' ? 'debug' : 'warn';
};

const cfg: LoggerConfig = {
  minLevel: resolveMinLevel(),
  remoteEndpoint: viteEnv.VITE_LOG_ENDPOINT ?? '',
};

// Map each level to the corresponding console method.
const CONSOLE_FNS: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: (...a) => console.debug(...a),
  info: (...a) => console.info(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

// Serialize Error objects when sending to a remote endpoint.
const serializeEntry = (entry: LogEntry): string =>
  JSON.stringify(entry, (_k, v: unknown) =>
    v instanceof Error ? { message: v.message, stack: v.stack } : v,
  );

const sendRemote = async (entry: LogEntry): Promise<void> => {
  if (!cfg.remoteEndpoint) return;
  try {
    await fetch(cfg.remoteEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializeEntry(entry),
    });
  } catch {
    // Never throw from the logger itself.
  }
};

const emit = (entry: LogEntry): void => {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}]`;
  const extras: unknown[] = [];
  if (entry.context) extras.push(entry.context);
  if (entry.error) extras.push(entry.error);
  CONSOLE_FNS[entry.level](prefix, entry.message, ...extras);
  void sendRemote(entry);
};

const makeLogFn =
  (level: LogLevel) =>
  (
    module: string,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void => {
    if (LEVEL_RANK[level] < LEVEL_RANK[cfg.minLevel]) return;
    emit({
      level,
      module,
      message,
      context,
      timestamp: new Date().toISOString(),
      sessionId: SESSION_ID,
      error,
    });
  };

export const logger = {
  debug: makeLogFn('debug'),
  info: makeLogFn('info'),
  warn: makeLogFn('warn'),
  error: makeLogFn('error'),

  configure(overrides: Partial<LoggerConfig>): void {
    Object.assign(cfg, overrides);
  },

  getSessionId(): string {
    return SESSION_ID;
  },
};
