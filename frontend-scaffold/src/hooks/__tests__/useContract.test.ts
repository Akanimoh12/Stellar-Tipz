import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { useContract } from "../useContract";
import { useWalletStore } from "../../store/walletStore";
import * as hookExports from "../";
import {
  mockSorobanResponse,
  mockSorobanError,
  mockSorobanTransaction,
  mockSorobanTransactionError,
  resetSorobanMocks,
  mockServer,
} from "../../test/mocks/soroban";

const mockWallet = {
  publicKey: null as string | null,
  signTransaction: vi.fn(async (xdr: string) => xdr),
};

const mockProfile = {
  owner: "GA0000000000000000000000000000000000000000000000000000000001",
  username: "alice",
  displayName: "Alice",
  bio: "Creator bio",
  imageUrl: "",
  xHandle: "@alice",
  xFollowers: 10,
  xEngagementAvg: 5,
  creditScore: 75,
  totalTipsReceived: "1000",
  totalTipsCount: 2,
  balance: "0",
  registeredAt: 0,
  updatedAt: 0,
};

const mockLeaderboard = [
  {
    address: mockProfile.owner,
    username: mockProfile.username,
    totalTipsReceived: "1000",
    creditScore: 75,
  },
];

const mockStats = {
  totalCreators: 1,
  totalTipsCount: 12,
  totalTipsVolume: "1000",
  totalFeesCollected: "20",
  feeBps: 200,
};

vi.mock("../", () => ({
  useWallet: vi.fn(),
}));

vi.mock("../../helpers/env", () => ({
  env: {
    contractId: "C1234567890",
    horizonUrl: "https://horizon-testnet.stellar.org",
    useMockData: false,
  },
}));

vi.mock("../../services", async () => {
  const { sorobanMock, mockServer } = await import("../../test/mocks/soroban");
  return {
    BASE_FEE: "100",
    getServer: vi.fn(() => mockServer),
    getTxBuilder: vi.fn(
      async (pubKey: string, fee: string, server: unknown, networkPassphrase: string) =>
        new sorobanMock.TransactionBuilder(pubKey, { fee, networkPassphrase }),
    ),
    getSimulationTxBuilder: vi.fn(
      (pubKey: string, fee: string, networkPassphrase: string) =>
        new sorobanMock.TransactionBuilder(pubKey, { fee, networkPassphrase }),
    ),
    simulateTx: vi.fn(async (tx: unknown) => mockServer.simulateTransaction(tx)),
    submitTx: vi.fn(async (signedXdr: string) => {
      const parsed = JSON.parse(signedXdr) as {
        method?: string;
        operations?: unknown[];
      };
      const response = await mockServer.sendTransaction({
        method: parsed.method,
        operations: parsed.operations,
      });
      return response.hash;
    }),
    accountToScVal: vi.fn((value: string) => value),
    numberToI128: vi.fn((value: number | bigint) => value),
  };
});

describe("useContract", () => {
  beforeEach(() => {
    resetSorobanMocks();
    vi.clearAllMocks();
    useWalletStore.setState({ network: "TESTNET" });
    vi.mocked(hookExports.useWallet).mockReturnValue(mockWallet as never);
    mockWallet.publicKey = null;
    mockWallet.signTransaction.mockImplementation(async (xdr: string) => xdr);
  });

  it("fetches profile successfully", async () => {
    mockSorobanResponse("get_profile", mockProfile);
    const { result } = renderHook(() => useContract());

    const profile = await act(() => result.current.getProfile("GA..."));

    expect(profile.username).toBe("alice");
    expect(profile.creditScore).toBe(75);
  });

  it("fetches leaderboard successfully", async () => {
    mockSorobanResponse("get_leaderboard", mockLeaderboard);
    const { result } = renderHook(() => useContract());

    const leaderboard = await act(() => result.current.getLeaderboard(5));

    expect(leaderboard).toHaveLength(1);
    expect(leaderboard[0].username).toBe("alice");
  });

  it("fetches stats successfully", async () => {
    mockSorobanResponse("get_stats", mockStats);
    const { result } = renderHook(() => useContract());

    const stats = await act(() => result.current.getStats());

    expect(stats.totalCreators).toBe(1);
    expect(stats.totalTipsCount).toBe(12);
  });

  it("sends tip and returns transaction hash", async () => {
    mockWallet.publicKey = "GA0000000000000000000000000000000000000000000000000000000002";
    mockSorobanTransaction("send_tip", "tx_hash_123");
    const { result } = renderHook(() => useContract());

    const txHash = await act(() => result.current.sendTip("GA...", "1", "message"));

    expect(txHash).toBe("tx_hash_123");
  });

  it("registers a profile and returns transaction hash", async () => {
    mockWallet.publicKey = "GA0000000000000000000000000000000000000000000000000000000002";
    mockSorobanTransaction("register_profile", "tx_hash_register");
    const { result } = renderHook(() => useContract());

    const txHash = await act(() =>
      result.current.registerProfile({
        username: "alice",
        displayName: "Alice",
        bio: "bio",
        imageUrl: "",
        xHandle: "@alice",
      }),
    );

    expect(txHash).toBe("tx_hash_register");
  });

  it("withdraws tips and returns transaction hash", async () => {
    mockWallet.publicKey = "GA0000000000000000000000000000000000000000000000000000000002";
    mockSorobanTransaction("withdraw_tips", "tx_hash_withdraw");
    const { result } = renderHook(() => useContract());

    const txHash = await act(() => result.current.withdrawTips("1"));

    expect(txHash).toBe("tx_hash_withdraw");
  });

  it("handles contract error gracefully", async () => {
    mockSorobanError("get_profile", new Error("Contract not found"));
    mockSorobanError("get_profile", new Error("Contract not found"));
    const { result } = renderHook(() => useContract());

    await expect(result.current.getProfile("GA...")).rejects.toThrow(
      "Contract not found",
    );
  });

  it("handles write errors gracefully", async () => {
    mockWallet.publicKey = "GA0000000000000000000000000000000000000000000000000000000002";
    mockSorobanTransactionError("send_tip", new Error("RPC failure"));
    const { result } = renderHook(() => useContract());

    await expect(result.current.sendTip("GA...", "1", "message")).rejects.toThrow("RPC failure");
  });

  it("exposes loading state while a request is pending", async () => {
    let resolveProfile: (value: typeof mockProfile) => void;
    const pendingProfile = new Promise<typeof mockProfile>((resolve) => {
      resolveProfile = resolve;
    });
    mockSorobanResponse("get_profile", pendingProfile);
    const { result } = renderHook(() => useContract());

    let request: Promise<typeof mockProfile> | undefined;
    act(() => {
      request = result.current.getProfile("GA...");
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    resolveProfile!(mockProfile);
    await expect(request as Promise<typeof mockProfile>).resolves.toMatchObject({
      username: "alice",
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("retries failed RPC calls", async () => {
    mockSorobanError("get_profile", new Error("temporary failure"));
    mockSorobanResponse("get_profile", mockProfile);
    const { result } = renderHook(() => useContract());

    const profile = await result.current.getProfile("GA...");

    expect(profile.username).toBe("alice");
    expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(2);
  });
});
