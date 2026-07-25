import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyXOwnership, refreshXMetrics } from "./x.service.js";

describe("X Integration Module (#973, #974)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Verify X Ownership (#974)", () => {
    it("should return true for a valid signed code", async () => {
      const handle = "creator123";
      const validCode = `tipz-${handle}`;
      const result = await verifyXOwnership(handle, validCode);
      expect(result).toBe(true);
    });

    it("should return false for an invalid signed code", async () => {
      const handle = "creator123";
      const invalidCode = "wrong-code";
      const result = await verifyXOwnership(handle, invalidCode);
      expect(result).toBe(false);
    });

    it("should throw an error if handle or code is missing", async () => {
      await expect(verifyXOwnership("", "code")).rejects.toThrow("Handle and signed code are required");
      await expect(verifyXOwnership("handle", "")).rejects.toThrow("Handle and signed code are required");
    });
  });

  describe("Refresh X Metrics Job (#973)", () => {
    it("should execute the refresh job without throwing", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      await expect(refreshXMetrics()).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith("Refreshing X metrics for active creators...");
    });
  });
});
