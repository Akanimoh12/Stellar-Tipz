import { useCallback, useEffect, useRef, useState } from "react";

type StoredPayload<T extends Record<string, unknown>> = {
  version: 1 | 2;
  savedAt: number;
  data: Partial<T>;
};

/** Drafts older than this are discarded on read. */
export const FORM_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;

/** Debounce window before a changed form payload is written to storage. */
export const FORM_DRAFT_DEBOUNCE_MS = 1_000;

const STORAGE_PAYLOAD_VERSION = 2;

/**
 * Field-name fragments (lowercase substring match) that are never persisted.
 * Includes credentials plus tip amounts/recipient addresses per #1308.
 */
export const SENSITIVE_FIELD_PATTERNS: readonly string[] = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "privatekey",
  "mnemonic",
  "seed",
  "credential",
  "otp",
  "cvv",
  "ssn",
  "amount",
  "recipient",
  "destination",
];

export function stripSensitiveFields<T extends Record<string, unknown>>(
  data: T,
  excludeFields: readonly string[] = [],
): Partial<T> {
  const excluded = new Set(excludeFields);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (excluded.has(key)) continue;
    const lower = key.toLowerCase();
    if (SENSITIVE_FIELD_PATTERNS.some((pattern) => lower.includes(pattern))) {
      continue;
    }
    result[key] = value;
  }
  return result as Partial<T>;
}

export type UseFormAutosaveOptions<T extends Record<string, unknown>> = {
  storageKey: string;
  data: T;
  onRestore: (data: T) => void;
  enabled?: boolean;
  /** How long a draft stays restorable. Default 24 hours. */
  ttlMs?: number;
  /** Debounce before writing a change. Default 1000ms. */
  debounceMs?: number;
  /** Extra field names to exclude from persistence (on top of the sensitive defaults). */
  excludeFields?: readonly string[];
};

export type UseFormAutosaveResult = {
  /** True when a valid, unexpired draft was found on mount (or after discard is undone by a later write cycle). */
  hasDraft: boolean;
  draftSavedAt: number | null;
  /** Apply the stored draft via onRestore. Does not clear storage (next save overwrites it). */
  restoreDraft: () => void;
  /** Remove the stored draft without applying it. */
  discardDraft: () => void;
  /** Alias of discardDraft — call after a successful submit. */
  clearSaved: () => void;
};

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isValidPayload<T extends Record<string, unknown>>(
  parsed: unknown,
): parsed is StoredPayload<T> {
  if (!parsed || typeof parsed !== "object") return false;
  const candidate = parsed as Partial<StoredPayload<T>>;
  return (
    (candidate.version === 1 || candidate.version === 2) &&
    typeof candidate.savedAt === "number" &&
    !!candidate.data &&
    typeof candidate.data === "object"
  );
}

/**
 * Reads a valid, unexpired draft from localStorage, migrating a legacy
 * sessionStorage draft (v1) into localStorage on the way. Returns null when
 * nothing restorable exists.
 */
function readDraft<T extends Record<string, unknown>>(
  storageKey: string,
  ttlMs: number,
): StoredPayload<T> | null {
  try {
    const legacy = sessionStorage.getItem(storageKey);
    if (legacy) {
      if (!localStorage.getItem(storageKey)) {
        const parsedLegacy = safeParse<unknown>(legacy);
        if (isValidPayload<T>(parsedLegacy)) {
          localStorage.setItem(storageKey, legacy);
        }
      }
      sessionStorage.removeItem(storageKey);
    }

    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = safeParse<unknown>(raw);
    if (!isValidPayload<T>(parsed)) {
      localStorage.removeItem(storageKey);
      return null;
    }
    if (Date.now() - parsed.savedAt > ttlMs) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persists form drafts to localStorage with a debounced writer.
 *
 * - No window.confirm on mount — consumers render DraftRestoreBanner and call
 *   restoreDraft()/discardDraft() explicitly.
 * - Sensitive fields (credentials, amounts, recipient addresses) are stripped
 *   before persistence.
 * - Drafts expire after 24 hours (FORM_DRAFT_TTL_MS).
 * - Pending writes are flushed on unmount and on pagehide.
 * - Legacy sessionStorage drafts (v1) are migrated to localStorage once.
 */
export function useFormAutosave<T extends Record<string, unknown>>(
  options: UseFormAutosaveOptions<T>,
): UseFormAutosaveResult {
  const {
    storageKey,
    data,
    onRestore,
    enabled = true,
    ttlMs = FORM_DRAFT_TTL_MS,
    debounceMs = FORM_DRAFT_DEBOUNCE_MS,
    excludeFields,
  } = options;

  // Lazy init: migrate legacy sessionStorage draft and surface any restorable
  // draft before the first paint. Never auto-restores or prompts.
  const [initialDraft] = useState<StoredPayload<T> | null>(() =>
    enabled ? readDraft<T>(storageKey, ttlMs) : null,
  );
  const [hasDraft, setHasDraft] = useState(initialDraft !== null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(
    initialDraft?.savedAt ?? null,
  );

  const onRestoreRef = useRef(onRestore);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  const lastWrittenRef = useRef<string | null>(null);
  const pendingWriteRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingWrite = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingWriteRef.current = null;
  }, []);

  const readStoredPayload = useCallback(
    (): StoredPayload<T> | null => readDraft<T>(storageKey, ttlMs),
    [storageKey, ttlMs],
  );

  // Debounced save of stripped form data.
  useEffect(() => {
    if (!enabled) return;

    const stripped = stripSensitiveFields(data, excludeFields);
    const serialized = JSON.stringify(stripped);
    if (serialized === lastWrittenRef.current) return;

    const write = () => {
      try {
        const savedAt = Date.now();
        const payload: StoredPayload<T> = {
          version: STORAGE_PAYLOAD_VERSION,
          savedAt,
          data: stripped,
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
        lastWrittenRef.current = serialized;
        setDraftSavedAt(savedAt);
      } catch {
        // Quota or storage failure — non-fatal.
      }
    };

    pendingWriteRef.current = write;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingWriteRef.current = null;
      write();
    }, debounceMs);

    // Only flush on unmount (via the lifetime effect below), not here —
    // flushing on every data change would defeat the debounce.
  }, [data, enabled, storageKey, debounceMs, excludeFields]);

  // Flush pending writes on unmount and pagehide.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const write = pendingWriteRef.current;
      if (write) {
        pendingWriteRef.current = null;
        write();
      }
    };

    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const restoreDraft = useCallback(() => {
    const stored = readStoredPayload();
    if (!stored) {
      setHasDraft(false);
      setDraftSavedAt(null);
      return;
    }
    onRestoreRef.current(stored.data as T);
    setHasDraft(false);
  }, [readStoredPayload]);

  const discardDraft = useCallback(() => {
    cancelPendingWrite();
    lastWrittenRef.current = null;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setHasDraft(false);
    setDraftSavedAt(null);
  }, [cancelPendingWrite, storageKey]);

  return {
    hasDraft,
    draftSavedAt,
    restoreDraft,
    discardDraft,
    clearSaved: discardDraft,
  };
}
