import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBalance } from "../useBalance";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockEnv = { horizonUrl: "https://horizon-testnet.stellar.org" };
vi.mock("../helpers/env", () => ({ env: mockEnv }));

import { env } from "../helpers/env";

const PUBLIC_KEY = "GBZXN7PIRZGNMHGA6M44Q5X5V5JH7OD7TLFAGL5EXAMPLEA";

const nativeBalances = (balance: string) =>
  new Response(JSON.stringify({ balances: [{ asset_type: "native", balance }] }));

describe("useBalance", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    (env as { horizonUrl: string }).horizonUrl =
      "https://horizon-testnet.stellar.org";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial state with no public key", () => {
    const { result } = renderHook(() => useBalance(undefined));

    expect(result.current.balance).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("fetches and sets the native balance on success", async () => {
    mockFetch.mockResolvedValue(nativeBalances("125.5000000"));

    const { result } = renderHook(() => useBalance(PUBLIC_KEY));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.balance).toBe("125.5000000");
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${env.horizonUrl}/accounts/${PUBLIC_KEY}`,
    );
  });

  it("defaults to 0 when no native balance exists", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ balances: [{ asset_type: "credit4", balance: "10" }] })),
    );

    const { result } = renderHook(() => useBalance(PUBLIC_KEY));

    await waitFor(() => {
      expect(result.current.balance).toBe("0");
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets an error when the fetch fails (error path)", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useBalance(PUBLIC_KEY));

    await waitFor(() => {
      expect(result.current.error).toBe("Network failure");
      expect(result.current.loading).toBe(false);
      expect(result.current.balance).toBeNull();
    });
  });

  it("refetch re-fetches the balance", async () => {
    mockFetch.mockResolvedValue(nativeBalances("50.0000000"));

    const { result } = renderHook(() => useBalance(PUBLIC_KEY));

    await waitFor(() => expect(result.current.balance).toBe("50.0000000"));

    mockFetch.mockResolvedValue(nativeBalances("75.0000000"));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.balance).toBe("75.0000000"));
  });

  it("cleanup does not throw on unmount", () => {
    const { unmount } = renderHook(() => useBalance(PUBLIC_KEY));
    expect(() => unmount()).not.toThrow();
  });
});
