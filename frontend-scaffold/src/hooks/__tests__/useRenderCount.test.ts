import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRenderCount } from "../useRenderCount";

describe("useRenderCount", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    delete window.__TIPZ_RENDER_COUNTS__;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.__TIPZ_RENDER_COUNTS__;
  });

  it("counts the initial render and each rerender", () => {
    const { result, rerender } = renderHook(() => useRenderCount("TipCard"));

    expect(result.current).toBe(1);
    expect(window.__TIPZ_RENDER_COUNTS__).toEqual({ TipCard: 1 });

    rerender();

    expect(result.current).toBe(2);
    expect(window.__TIPZ_RENDER_COUNTS__).toEqual({ TipCard: 2 });
  });

  it("keeps independently keyed component instances", () => {
    const first = renderHook(() => useRenderCount("ProfileCard", "alice"));
    const second = renderHook(() => useRenderCount("ProfileCard", "bob"));

    first.rerender();

    expect(first.result.current).toBe(2);
    expect(second.result.current).toBe(1);
    expect(window.__TIPZ_RENDER_COUNTS__).toEqual({
      "ProfileCard:alice": 2,
      "ProfileCard:bob": 1,
    });
  });

  it("stops changing an instance count after cleanup", () => {
    const { unmount } = renderHook(() => useRenderCount("LeaderboardRow", "1"));
    expect(window.__TIPZ_RENDER_COUNTS__?.["LeaderboardRow:1"]).toBe(1);

    unmount();

    expect(window.__TIPZ_RENDER_COUNTS__?.["LeaderboardRow:1"]).toBe(1);
  });

  it("is a no-op outside development", () => {
    vi.stubEnv("DEV", false);

    const { result, rerender } = renderHook(() => useRenderCount("TipCard"));
    rerender();

    expect(result.current).toBe(0);
    expect(window.__TIPZ_RENDER_COUNTS__).toBeUndefined();
  });
});
