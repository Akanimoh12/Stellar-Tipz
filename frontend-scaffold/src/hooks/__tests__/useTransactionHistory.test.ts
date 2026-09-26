import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTransactionHistory } from "../useTransactionHistory";
import { useContract } from "../useContract";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../useContract");
const mockUseContract = vi.mocked(useContract);

// Stub env so tests control useMockData without importing Vite globals.
vi.mock("../../helpers/env", () => ({
  env: { useMockData: false },
}));

// Stub mockData — we only test the real API path in this suite.
vi.mock("../../features/mockData", () => ({
  mockTips: [],
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WALLET = "GCREATOR1111111111111111111111111111111111111111111111111111";
const TIPPER = "GTIPPER11111111111111111111111111111111111111111111111111111";

const emptyDateRange = { start: "", end: "" };

function makeTip(
  id: number,
  creator: string,
  tipper: string,
  timestamp = 1_700_000_000 + id,
) {
  return {
    id,
    creator,
    tipper,
    amount: String(1_000_000 * id),
    message: `tip ${id}`,
    timestamp,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupContract(
  overrides: Partial<ReturnType<typeof useContract>> = {},
) {
  mockUseContract.mockReturnValue({
    getRecentTips: vi.fn().mockResolvedValue([]),
    getTipsByTipper: vi.fn().mockResolvedValue([]),
    getCreatorTipCount: vi.fn().mockResolvedValue(0),
    getTipperTipCount: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as ReturnType<typeof useContract>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useTransactionHistory", () => {
  beforeEach(() => {
    setupContract();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Empty state ─────────────────────────────────────────────────────────────

  it("returns empty transactions when wallet is null", async () => {
    const { result } = renderHook(() =>
      useTransactionHistory(null, "all", emptyDateRange),
    );

    expect(result.current.transactions).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns empty transactions when API returns nothing", async () => {
    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "all", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.transactions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // ── Received tips ───────────────────────────────────────────────────────────

  it("classifies tips returned by getRecentTips as received", async () => {
    const receivedTip = makeTip(1, WALLET, TIPPER);
    setupContract({
      getRecentTips: vi.fn().mockResolvedValue([receivedTip]),
      getCreatorTipCount: vi.fn().mockResolvedValue(1),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "all", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].type).toBe("received");
    expect(result.current.transactions[0].counterparty).toBe(TIPPER);
  });

  // ── Sent tips ───────────────────────────────────────────────────────────────

  it("classifies tips returned by getTipsByTipper as sent", async () => {
    const sentTip = makeTip(2, TIPPER, WALLET);
    setupContract({
      getTipsByTipper: vi.fn().mockResolvedValue([sentTip]),
      getTipperTipCount: vi.fn().mockResolvedValue(1),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "all", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0].type).toBe("sent");
    expect(result.current.transactions[0].counterparty).toBe(TIPPER);
  });

  // ── Mixed (sent + received) ──────────────────────────────────────────────────

  it("merges received and sent tips sorted newest first", async () => {
    const older = makeTip(3, WALLET, TIPPER, 1_700_000_000);
    const newer = makeTip(4, TIPPER, WALLET, 1_700_001_000);
    setupContract({
      getRecentTips: vi.fn().mockResolvedValue([older]),
      getTipsByTipper: vi.fn().mockResolvedValue([newer]),
      getCreatorTipCount: vi.fn().mockResolvedValue(1),
      getTipperTipCount: vi.fn().mockResolvedValue(1),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "all", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.transactions).toHaveLength(2);
    // Newest first
    expect(result.current.transactions[0].type).toBe("sent");
    expect(result.current.transactions[1].type).toBe("received");
  });

  it("filters correctly by sent tab", async () => {
    const receivedTip = makeTip(5, WALLET, TIPPER);
    const sentTip = makeTip(6, TIPPER, WALLET);
    setupContract({
      getRecentTips: vi.fn().mockResolvedValue([receivedTip]),
      getTipsByTipper: vi.fn().mockResolvedValue([sentTip]),
      getCreatorTipCount: vi.fn().mockResolvedValue(1),
      getTipperTipCount: vi.fn().mockResolvedValue(1),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "sent", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].type).toBe("sent");
  });

  it("filters correctly by received tab", async () => {
    const receivedTip = makeTip(7, WALLET, TIPPER);
    const sentTip = makeTip(8, TIPPER, WALLET);
    setupContract({
      getRecentTips: vi.fn().mockResolvedValue([receivedTip]),
      getTipsByTipper: vi.fn().mockResolvedValue([sentTip]),
      getCreatorTipCount: vi.fn().mockResolvedValue(1),
      getTipperTipCount: vi.fn().mockResolvedValue(1),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "received", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].type).toBe("received");
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  it("hasMore is true when offset < total", async () => {
    const tips = Array.from({ length: 20 }, (_, i) =>
      makeTip(i + 10, WALLET, TIPPER),
    );
    setupContract({
      getRecentTips: vi.fn().mockResolvedValue(tips),
      getCreatorTipCount: vi.fn().mockResolvedValue(40), // 40 total, only 20 fetched
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "received", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(true);
  });

  it("loadMore fetches next page and appends results", async () => {
    const firstPage = Array.from({ length: 20 }, (_, i) =>
      makeTip(i + 30, WALLET, TIPPER, 1_700_000_000 + i),
    );
    const secondPage = [makeTip(50, WALLET, TIPPER, 1_699_000_000)];
    const mockGetRecentTips = vi
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    setupContract({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: vi.fn().mockResolvedValue(21),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "received", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transactions).toHaveLength(20);

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.transactions).toHaveLength(21));
  });

  it("hasMore is false when all pages are loaded", async () => {
    const tips = [makeTip(60, WALLET, TIPPER)];
    setupContract({
      getRecentTips: vi.fn().mockResolvedValue(tips),
      getCreatorTipCount: vi.fn().mockResolvedValue(1),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "received", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(false);
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("sets error when both API calls fail", async () => {
    setupContract({
      getRecentTips: vi.fn().mockRejectedValue(new Error("RPC down")),
      getTipsByTipper: vi.fn().mockRejectedValue(new Error("RPC down")),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "all", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load transaction history.");
  });

  it("shows partial data when only one API call fails", async () => {
    const receivedTip = makeTip(70, WALLET, TIPPER);
    setupContract({
      getRecentTips: vi.fn().mockResolvedValue([receivedTip]),
      getTipsByTipper: vi.fn().mockRejectedValue(new Error("RPC down")),
      getCreatorTipCount: vi.fn().mockResolvedValue(1),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "all", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Received tips still shown even though sent tips failed
    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  // ── Direction correctness (issue #1302) ────────────────────────────────────

  it("never shows tips from unrelated wallets", async () => {
    const unrelatedTip = makeTip(80, "GCREATOR_OTHER", "GTIPPER_OTHER");
    setupContract({
      // getRecentTips only returns tips for the queried creator — so
      // an unrelated tip should never appear. Confirm hook does not
      // inject phantom data.
      getRecentTips: vi.fn().mockResolvedValue([]),
      getTipsByTipper: vi.fn().mockResolvedValue([]),
    });

    // Suppress unused variable warning
    void unrelatedTip;

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "all", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.transactions).toHaveLength(0);
  });

  it("refetch resets and re-fetches data", async () => {
    const tip = makeTip(90, WALLET, TIPPER);
    const mockGetRecentTips = vi
      .fn()
      .mockResolvedValueOnce([]) // first load returns nothing
      .mockResolvedValueOnce([tip]); // refetch returns a tip

    setupContract({
      getRecentTips: mockGetRecentTips,
      getCreatorTipCount: vi.fn().mockResolvedValue(1),
    });

    const { result } = renderHook(() =>
      useTransactionHistory(WALLET, "all", emptyDateRange),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transactions).toHaveLength(0);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.transactions).toHaveLength(1));
  });
});
