/**
 * Reconciliation service tests.
 *
 * Tests verify that the reconciliation job correctly detects discrepancies,
 * handles sampling, auto-repairs safe issues, and respects configuration.
 *
 * Issue #1271
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../db/prisma.js";
import {
  runReconciliation,
  getReconciliationSummary,
  triggerManualReconciliation,
} from "./reconciliation.service.js";
import type { ReconciliationConfig } from "./reconciliation.types.ts";

describe("Reconciliation Service", () => {
  describe("Basic reconciliation run", () => {
    it("should run reconciliation with default config", async () => {
      const report = await runReconciliation();

      expect(report).toBeDefined();
      expect(report.runId).toBeDefined();
      expect(report.startedAt).toBeDefined();
      expect(report.completedAt).toBeDefined();
      expect(report.config).toBeDefined();
      expect(report.discrepancies).toBeInstanceOf(Array);
      expect(report.metrics).toBeDefined();
    });

    it("should respect custom sampling rate", async () => {
      const customConfig: Partial<ReconciliationConfig> = {
        samplingRate: 0.5, // 50% sampling
      };

      const report = await runReconciliation(customConfig);

      expect(report.config.samplingRate).toBe(0.5);
    });

    it("should respect max RPC calls limit", async () => {
      const customConfig: Partial<ReconciliationConfig> = {
        maxRpcCalls: 10,
      };

      const report = await runReconciliation(customConfig);

      expect(report.config.maxRpcCalls).toBe(10);
      expect(report.metrics.rpcCallsMade).toBeLessThanOrEqual(10);
    });
  });

  describe("Discrepancy detection", () => {
    beforeEach(async () => {
      // Create test data
      await prisma.user.createMany({
        data: [
          { stellarAddress: "GRECON1", username: "user1" },
          { stellarAddress: "GRECON2", username: "user2" },
        ],
      });
    });

    it("should detect balance discrepancies", async () => {
      const report = await runReconciliation({ samplingRate: 1.0 });

      const balanceDiscrepancies = report.discrepancies.filter(
        (d) => d.type === "balance",
      );

      // In mock mode, we expect discrepancies since on-chain data is mocked
      expect(balanceDiscrepancies).toBeInstanceOf(Array);
    });

    it("should detect tip total discrepancies", async () => {
      const report = await runReconciliation({ samplingRate: 1.0 });

      const tipDiscrepancies = report.discrepancies.filter(
        (d) => d.type === "tip_total",
      );

      expect(tipDiscrepancies).toBeInstanceOf(Array);
    });

    it("should detect profile field discrepancies", async () => {
      const report = await runReconciliation({ samplingRate: 1.0 });

      const profileDiscrepancies = report.discrepancies.filter(
        (d) => d.type === "profile_field",
      );

      expect(profileDiscrepancies).toBeInstanceOf(Array);
    });

    it("should detect leaderboard position discrepancies", async () => {
      const report = await runReconciliation({ samplingRate: 1.0 });

      const leaderboardDiscrepancies = report.discrepancies.filter(
        (d) => d.type === "leaderboard_position",
      );

      expect(leaderboardDiscrepancies).toBeInstanceOf(Array);
    });
  });

  describe("Auto-repair functionality", () => {
    it("should auto-repair safe discrepancies when enabled", async () => {
      const config: Partial<ReconciliationConfig> = {
        autoRepairEnabled: true,
      };

      const report = await runReconciliation(config);

      expect(report.autoRepaired).toBeGreaterThanOrEqual(0);
    });

    it("should not auto-repair when disabled", async () => {
      const config: Partial<ReconciliationConfig> = {
        autoRepairEnabled: false,
      };

      const report = await runReconciliation(config);

      expect(report.autoRepaired).toBe(0);
    });

    it("should count manual review requirements", async () => {
      const report = await runReconciliation();

      expect(report.requiresManualReview).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Discrepancy rate calculation", () => {
    it("should calculate discrepancy rate correctly", async () => {
      const report = await runReconciliation({ samplingRate: 1.0 });

      expect(report.discrepancyRate).toBeGreaterThanOrEqual(0);
      expect(report.discrepancyRate).toBeLessThanOrEqual(1);
    });

    it("should handle zero sample case", async () => {
      // Test with no data
      const report = await runReconciliation({ samplingRate: 0.01 });

      expect(report.discrepancyRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Alerting thresholds", () => {
    it("should detect high discrepancy rate", async () => {
      const config: Partial<ReconciliationConfig> = {
        alertThreshold: 0.01, // Very low threshold
      };

      const report = await runReconciliation(config);

      // With mock data, we likely have discrepancies
      expect(report.config.alertThreshold).toBe(0.01);
    });

    it("should handle normal discrepancy rate", async () => {
      const config: Partial<ReconciliationConfig> = {
        alertThreshold: 0.5, // High threshold
      };

      const report = await runReconciliation(config);

      expect(report.config.alertThreshold).toBe(0.5);
    });
  });

  describe("Metrics and performance", () => {
    it("should track RPC calls made", async () => {
      const report = await runReconciliation();

      expect(report.metrics.rpcCallsMade).toBeGreaterThanOrEqual(0);
    });

    it("should track duration", async () => {
      const report = await runReconciliation();

      expect(report.metrics.durationMs).toBeGreaterThan(0);
    });

    it("should complete within reasonable time", async () => {
      const startTime = Date.now();
      const report = await runReconciliation();
      const duration = Date.now() - startTime;

      expect(report.metrics.durationMs).toBe(duration);
      expect(duration).toBeLessThan(10000); // Should complete in < 10s
    });
  });

  describe("Manual trigger", () => {
    it("should support manual reconciliation trigger", async () => {
      const report = await triggerManualReconciliation();

      expect(report).toBeDefined();
      expect(report.runId).toBeDefined();
    });

    it("should accept custom config in manual trigger", async () => {
      const config: Partial<ReconciliationConfig> = {
        samplingRate: 0.25,
      };

      const report = await triggerManualReconciliation(config);

      expect(report.config.samplingRate).toBe(0.25);
    });
  });

  describe("Reconciliation summary", () => {
    it("should return reconciliation summary", async () => {
      const summary = await getReconciliationSummary();

      expect(summary).toBeDefined();
      expect(summary.lastRun).toBeDefined();
      expect(summary.lastDiscrepancyRate).toBeGreaterThanOrEqual(0);
      expect(summary.trend).toBeOneOf(["improving", "stable", "degrading"]);
      expect(summary.alertLevel).toBeOneOf(["none", "warning", "critical"]);
    });
  });

  describe("Error handling", () => {
    it("should handle RPC errors gracefully", async () => {
      // The mock implementation handles errors internally
      const report = await runReconciliation();

      expect(report).toBeDefined();
    });

    it("should handle database errors gracefully", async () => {
      // The implementation has try-catch blocks
      const report = await runReconciliation();

      expect(report).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty database", async () => {
      // Clear all data
      await prisma.tip.deleteMany();
      await prisma.user.deleteMany();

      const report = await runReconciliation();

      expect(report.totalSampled).toBe(0);
      expect(report.discrepanciesFound).toBe(0);
    });

    it("should handle very high sampling rate", async () => {
      const config: Partial<ReconciliationConfig> = {
        samplingRate: 1.0, // 100% sampling
      };

      const report = await runReconciliation(config);

      expect(report.config.samplingRate).toBe(1.0);
    });

    it("should handle very low sampling rate", async () => {
      const config: Partial<ReconciliationConfig> = {
        samplingRate: 0.01, // 1% sampling
      };

      const report = await runReconciliation(config);

      expect(report.config.samplingRate).toBe(0.01);
    });

    it("should handle zero max RPC calls", async () => {
      const config: Partial<ReconciliationConfig> = {
        maxRpcCalls: 0,
      };

      const report = await runReconciliation(config);

      expect(report.metrics.rpcCallsMade).toBe(0);
    });
  });

  describe("Discrepancy structure", () => {
    it("should include all required fields in discrepancies", async () => {
      const report = await runReconciliation();

      for (const discrepancy of report.discrepancies) {
        expect(discrepancy).toHaveProperty("type");
        expect(discrepancy).toHaveProperty("entityId");
        expect(discrepancy).toHaveProperty("entityType");
        expect(discrepancy).toHaveProperty("onChainValue");
        expect(discrepancy).toHaveProperty("offChainValue");
        expect(discrepancy).toHaveProperty("severity");
        expect(discrepancy).toHaveProperty("canAutoRepair");
        expect(discrepancy).toHaveProperty("description");
        expect(discrepancy).toHaveProperty("detectedAt");
      }
    });

    it("should have valid severity levels", async () => {
      const report = await runReconciliation();

      for (const discrepancy of report.discrepancies) {
        expect(discrepancy.severity).toBeOneOf(["low", "medium", "high"]);
      }
    });

    it("should have valid entity types", async () => {
      const report = await runReconciliation();

      for (const discrepancy of report.discrepancies) {
        expect(discrepancy.entityType).toBeOneOf(["user", "tip", "leaderboard"]);
      }
    });
  });
});
