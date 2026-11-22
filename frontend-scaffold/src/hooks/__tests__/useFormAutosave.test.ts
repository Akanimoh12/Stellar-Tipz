import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  useFormAutosave,
  stripSensitiveFields,
  FORM_DRAFT_TTL_MS,
} from "../useFormAutosave";

const KEY = "tipz_test_form";

type FormData = Record<string, unknown> & {
  username?: string;
  displayName?: string;
  password?: string;
  amount?: string;
  recipient?: string;
  secret?: string;
  imageUrl?: string;
};

function seedDraft(data: Record<string, unknown>, savedAt = Date.now()) {
  localStorage.setItem(KEY, JSON.stringify({ version: 2, savedAt, data }));
}

describe("stripSensitiveFields", () => {
  it("removes credential, amount, and recipient fields by substring match", () => {
    const stripped = stripSensitiveFields({
      username: "alice",
      displayName: "Alice",
      password: "hunter2",
      amount: "5",
      recipient: "GABC",
      destination: "GDEST",
      userApiKey: "k",
      seedPhrase: "x",
      otp: "123456",
      cvv: "123",
      ssn: "000",
      mnemonic: "a b c",
      credentials: "c",
      passwd: "p",
      secret: "s",
      token: "t",
      privateKey: "pk",
    });

    expect(stripped).toEqual({
      username: "alice",
      displayName: "Alice",
    });
  });

  it("removes extra excludeFields keys", () => {
    const stripped = stripSensitiveFields(
      { username: "alice", imageUrl: "data:huge" },
      ["imageUrl"],
    );
    expect(stripped).toEqual({ username: "alice" });
  });
});

describe("useFormAutosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("starts with no draft when storage is empty", () => {
    const { result } = renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "" },
        onRestore: vi.fn(),
      }),
    );

    expect(result.current.hasDraft).toBe(false);
    expect(result.current.draftSavedAt).toBeNull();
  });

  it("surfaces a valid draft on mount without prompting", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    seedDraft({ username: "alice" }, Date.now() - 60_000);

    const { result } = renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "" },
        onRestore: vi.fn(),
      }),
    );

    expect(result.current.hasDraft).toBe(true);
    expect(result.current.draftSavedAt).not.toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("does not surface an expired draft and removes it", () => {
    seedDraft({ username: "alice" }, Date.now() - FORM_DRAFT_TTL_MS - 1_000);

    const { result } = renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "" },
        onRestore: vi.fn(),
      }),
    );

    expect(result.current.hasDraft).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("saves changes to localStorage after the debounce window", async () => {
    vi.useFakeTimers();

    const { rerender } = renderHook(
      ({ data }: { data: FormData }) =>
        useFormAutosave<FormData>({
          storageKey: KEY,
          data,
          onRestore: vi.fn(),
        }),
      { initialProps: { data: { username: "a" } as FormData } },
    );

    rerender({ data: { username: "alice" } });
    expect(localStorage.getItem(KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(2);
    expect(parsed.data).toEqual({ username: "alice" });
  });

  it("never persists sensitive fields", async () => {
    vi.useFakeTimers();

    renderHook(() =>
      useFormAutosave({
        storageKey: KEY,
        data: {
          displayName: "Alice",
          password: "hunter2",
          amount: "5",
          recipient: "GABC",
          secret: "shh",
        },
        onRestore: vi.fn(),
      }),
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    const parsed = JSON.parse(localStorage.getItem(KEY)!);
    expect(parsed.data).toEqual({ displayName: "Alice" });
    expect(parsed.data).not.toHaveProperty("password");
    expect(parsed.data).not.toHaveProperty("amount");
    expect(parsed.data).not.toHaveProperty("recipient");
    expect(parsed.data).not.toHaveProperty("secret");
  });

  it("restores a draft through onRestore without clearing storage", () => {
    seedDraft({ username: "alice" });
    const onRestore = vi.fn();

    const { result } = renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "" },
        onRestore,
      }),
    );

    expect(result.current.hasDraft).toBe(true);

    act(() => {
      result.current.restoreDraft();
    });

    expect(onRestore).toHaveBeenCalledWith({ username: "alice" });
    expect(result.current.hasDraft).toBe(false);
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("discards a draft without calling onRestore", () => {
    seedDraft({ username: "alice" });
    const onRestore = vi.fn();

    const { result } = renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "" },
        onRestore,
      }),
    );

    act(() => {
      result.current.discardDraft();
    });

    expect(onRestore).not.toHaveBeenCalled();
    expect(result.current.hasDraft).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("clearSaved aliases discardDraft", () => {
    seedDraft({ username: "alice" });

    const { result } = renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "" },
        onRestore: vi.fn(),
      }),
    );

    act(() => {
      result.current.clearSaved();
    });

    expect(result.current.hasDraft).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("flushes a pending debounced write on unmount", () => {
    vi.useFakeTimers();

    const { rerender, unmount } = renderHook(
      ({ data }: { data: FormData }) =>
        useFormAutosave<FormData>({
          storageKey: KEY,
          data,
          onRestore: vi.fn(),
        }),
      { initialProps: { data: { username: "a" } as FormData } },
    );

    rerender({ data: { username: "alice" } });
    // Unmount before the debounce fires.
    unmount();

    const raw = localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).data).toEqual({ username: "alice" });
  });

  it("does not re-write the draft when data is unchanged", async () => {
    vi.useFakeTimers();

    const { rerender } = renderHook(
      ({ data }: { data: FormData }) =>
        useFormAutosave<FormData>({
          storageKey: KEY,
          data,
          onRestore: vi.fn(),
        }),
      { initialProps: { data: { username: "alice" } as FormData } },
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const first = localStorage.getItem(KEY)!;

    rerender({ data: { username: "alice" } });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(localStorage.getItem(KEY)).toBe(first);
  });

  it("migrates a legacy sessionStorage draft to localStorage", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        data: { username: "legacy" },
      }),
    );

    const { result } = renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "" },
        onRestore: vi.fn(),
      }),
    );

    expect(result.current.hasDraft).toBe(true);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();

    const onRestore = vi.fn();
    const { result: result2 } = renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "" },
        onRestore,
      }),
    );
    act(() => {
      result2.current.restoreDraft();
    });
    expect(onRestore).toHaveBeenCalledWith({ username: "legacy" });
  });

  it("skips saving when enabled is false", async () => {
    vi.useFakeTimers();

    renderHook(() =>
      useFormAutosave<FormData>({
        storageKey: KEY,
        data: { username: "alice" },
        onRestore: vi.fn(),
        enabled: false,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
