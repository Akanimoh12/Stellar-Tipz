import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ReauthPrompt from "../ReauthPrompt";
import {
  setTokens,
  getTokenManagerStatus,
  resetTokenManagerForTests,
} from "@/services/auth/tokenManager";
import { useToastStore } from "@/store/toastStore";

function jwt(expSecFromNow: number): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecFromNow }),
  );
  return `${header}.${payload}.sig`;
}

describe("ReauthPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubGlobal("fetch", vi.fn());
    resetTokenManagerForTests();
    useToastStore.setState({ visibleToasts: [], queuedToasts: [] });
  });

  afterEach(() => {
    resetTokenManagerForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders nothing when the session does not need re-auth", () => {
    setTokens({ accessToken: jwt(900), refreshToken: "r1" });
    const { container } = render(<ReauthPrompt />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("opens when status is reauth-required and preserves drafts on dismiss", async () => {
    setTokens({ accessToken: jwt(900), refreshToken: "r1" });
    localStorage.setItem("tipz_register_form", JSON.stringify({ draft: true }));

    // Trigger reauth-required via a failed refresh.
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    const { refreshTokens } = await import("@/services/auth/tokenManager");
    await refreshTokens();
    expect(getTokenManagerStatus()).toBe("reauth-required");

    vi.useRealTimers();
    render(<ReauthPrompt />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/unsaved form data and drafts have been kept/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /continue without signing in/i }),
    );

    expect(getTokenManagerStatus()).toBe("authenticated");
    // Draft untouched
    expect(localStorage.getItem("tipz_register_form")).not.toBeNull();
  });

  it("retries the refresh on Try again and toasts success", async () => {
    setTokens({ accessToken: jwt(1), refreshToken: "r1" });
    const { refreshTokens } = await import("@/services/auth/tokenManager");
    vi.mocked(fetch).mockImplementation(() =>
      Promise.reject(new Error("fail")),
    );
    await refreshTokens();
    expect(getTokenManagerStatus()).toBe("reauth-required");

    const renewed = jwt(900);
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ accessToken: renewed, refreshToken: "r2" }),
          { status: 200 },
        ),
      ),
    );

    vi.useRealTimers();
    render(<ReauthPrompt />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(
      () => {
        expect(getTokenManagerStatus()).toBe("authenticated");
      },
      { timeout: 2000 },
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
