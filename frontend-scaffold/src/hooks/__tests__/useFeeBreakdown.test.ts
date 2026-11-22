import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFeeBreakdown } from "../useFeeBreakdown";
import * as useXlmPriceModule from "../useXlmPrice";

vi.mock("../useXlmPrice", () => ({
  useXlmPrice: vi.fn(),
}));

describe("useFeeBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useXlmPriceModule.useXlmPrice).mockReturnValue({
      price: 0.12,
      loading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("calculates fee breakdown accurately with XLM and fiat values", async () => {
    const { result } = renderHook(() =>
      useFeeBreakdown({
        amount: "100",
        platformFeePercent: 0.02,
        networkFeeXLM: "0.00001",
        isOpen: true,
      })
    );

    await waitFor(() => {
      expect(result.current.isEstimating).toBe(false);
    });

    const { breakdown, canSign, estimationError } = result.current;
    expect(estimationError).toBeNull();
    expect(canSign).toBe(true);

    // 100 XLM, 2% platform fee = 2 XLM, 0.00001 XLM network fee
    expect(breakdown.amountXLM).toBe("100");
    expect(breakdown.platformFeeXLM).toBe("2.0000000");
    expect(breakdown.networkFeeXLM).toBe("0.0000100");
    expect(breakdown.totalXLM).toBe("102.0000100");

    // Fiat check ($0.12/XLM)
    expect(breakdown.amountUSD).toBe("12.00");
    expect(breakdown.platformFeeUSD).toBe("0.24");
    expect(breakdown.totalUSD).toBe("12.24");
  });

  it("blocks signing with an explanation when estimation fails", async () => {
    const { result } = renderHook(() =>
      useFeeBreakdown({
        amount: "100",
        simulateFailure: true,
        isOpen: true,
      })
    );

    await waitFor(() => {
      expect(result.current.isEstimating).toBe(false);
    });

    expect(result.current.canSign).toBe(false);
    expect(result.current.estimationError).toContain("Network fee estimation failed");
  });

  it("blocks signing when amount is invalid or zero", async () => {
    const { result } = renderHook(() =>
      useFeeBreakdown({
        amount: "0",
        isOpen: true,
      })
    );

    await waitFor(() => {
      expect(result.current.isEstimating).toBe(false);
    });

    expect(result.current.canSign).toBe(false);
    expect(result.current.estimationError).toContain("Enter a valid transaction amount");
  });

  it("recomputes estimates mid-flow when amount or fee config changes", async () => {
    const { result, rerender } = renderHook(
      ({ amount, feePercent }: { amount: string; feePercent: number }) =>
        useFeeBreakdown({
          amount,
          platformFeePercent: feePercent,
          networkFeeXLM: "0.00001",
          isOpen: true,
        }),
      {
        initialProps: { amount: "100", feePercent: 0.02 },
      }
    );

    await waitFor(() => {
      expect(result.current.breakdown.platformFeeXLM).toBe("2.0000000");
    });

    // Change fee config and amount mid-flow
    rerender({ amount: "200", feePercent: 0.05 });

    await waitFor(() => {
      expect(result.current.breakdown.amountXLM).toBe("200");
      // 200 * 0.05 = 10 XLM
      expect(result.current.breakdown.platformFeeXLM).toBe("10.0000000");
      expect(result.current.breakdown.totalXLM).toBe("210.0000100");
    });
  });
});
