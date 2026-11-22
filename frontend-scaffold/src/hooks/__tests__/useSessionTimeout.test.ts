import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSessionTimeout } from "../useSessionTimeout";

const TIMEOUT_MS = 30 * 60 * 1000;
const WARN_MS = TIMEOUT_MS - 5 * 60 * 1000;

describe("useSessionTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function render(opts?: { isActive?: boolean; timeoutMs?: number }) {
    const onWarn = vi.fn();
    const onExpire = vi.fn();
    const hook = renderHook(
      ({ isActive, timeoutMs }: { isActive: boolean; timeoutMs?: number }) =>
        useSessionTimeout({ isActive, onWarn, onExpire, timeoutMs }),
      {
        initialProps: {
          isActive: opts?.isActive ?? true,
          timeoutMs: opts?.timeoutMs,
        },
      },
    );
    return { onWarn, onExpire, hook };
  }

  it("warns 5 minutes before expiry and expires at the timeout", () => {
    const { onWarn, onExpire } = render();

    vi.advanceTimersByTime(WARN_MS - 1);
    expect(onWarn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TIMEOUT_MS - WARN_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("resets timers on user activity", () => {
    const { onWarn, onExpire } = render();

    vi.advanceTimersByTime(WARN_MS - 60_000);
    window.dispatchEvent(new Event("mousedown"));

    // From the reset: warn at WARN_MS, expire at TIMEOUT_MS.
    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("does not start timers when inactive", () => {
    const { onWarn, onExpire } = render({ isActive: false });

    vi.advanceTimersByTime(TIMEOUT_MS * 2);
    expect(onWarn).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("stops timers when the hook unmounts", () => {
    const { onWarn, onExpire, hook } = render();

    hook.unmount();
    vi.advanceTimersByTime(TIMEOUT_MS * 2);
    expect(onWarn).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("does not expire on beforeunload", () => {
    const { onExpire } = render();

    window.dispatchEvent(new Event("beforeunload"));
    expect(onExpire).not.toHaveBeenCalled();
  });
});
