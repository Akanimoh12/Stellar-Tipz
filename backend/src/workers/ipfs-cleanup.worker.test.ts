/**
 * Tests for IPFS cleanup worker (issue #1635).
 * Covers dry-run verification and actual cleanup execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLogger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
vi.mock('../common/utils/logger.js', () => ({
  logger: mockLogger,
}))

const mockEnv = { IPFS_CLEANUP_GRACE_PERIOD_DAYS: '30' }
vi.mock('../config/env.js', () => ({
  env: mockEnv,
}))

const mockDryRunCleanup = vi.fn()
const mockExecuteCleanup = vi.fn()
vi.mock('../modules/ipfs/ipfs.service.js', () => ({
  dryRunCleanup: (...args: unknown[]) => mockDryRunCleanup(...args),
  executeCleanup: (...args: unknown[]) => mockExecuteCleanup(...args),
}))

import { runIpfsCleanupJob, handleIpfsCleanupJob } from './ipfs-cleanup.worker.js'

describe('IPFS cleanup worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runIpfsCleanupJob', () => {
    it('performs dry-run before execution', async () => {
      const dryRunOrphans = [
        { cid: 'QmTest1', age: 45.5, referenced: false },
        { cid: 'QmTest2', age: 50.0, referenced: false },
      ]
      mockDryRunCleanup.mockResolvedValueOnce(dryRunOrphans)
      mockExecuteCleanup.mockResolvedValueOnce({ unpinned: 2, skipped: 0 })

      const result = await runIpfsCleanupJob()

      expect(result.dryRun).toEqual(dryRunOrphans)
      expect(result.execution).toEqual({ unpinned: 2, skipped: 0 })
      expect(mockDryRunCleanup).toHaveBeenCalledBefore(mockExecuteCleanup)
    })

    it('logs dry-run report with orphan details', async () => {
      const dryRunOrphans = [
        { cid: 'QmTest1', age: 45.5, referenced: false },
      ]
      mockDryRunCleanup.mockResolvedValueOnce(dryRunOrphans)
      mockExecuteCleanup.mockResolvedValueOnce({ unpinned: 1, skipped: 0 })

      await runIpfsCleanupJob()

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ orphanCount: 1 }),
        'Dry-run cleanup report',
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          cid: 'QmTest1',
          ageDays: '45.5',
          referenced: false,
        }),
        'Orphan report',
      )
    })

    it('uses grace period from env config', async () => {
      mockEnv.IPFS_CLEANUP_GRACE_PERIOD_DAYS = '7'
      mockDryRunCleanup.mockResolvedValueOnce([])
      mockExecuteCleanup.mockResolvedValueOnce({ unpinned: 0, skipped: 0 })

      await runIpfsCleanupJob()

      expect(mockDryRunCleanup).toHaveBeenCalledWith(7)
      expect(mockExecuteCleanup).toHaveBeenCalledWith(7)
    })

    it('defaults grace period to 30 days when not configured', async () => {
      mockEnv.IPFS_CLEANUP_GRACE_PERIOD_DAYS = ''
      mockDryRunCleanup.mockResolvedValueOnce([])
      mockExecuteCleanup.mockResolvedValueOnce({ unpinned: 0, skipped: 0 })

      await runIpfsCleanupJob()

      expect(mockDryRunCleanup).toHaveBeenCalledWith(30)
      expect(mockExecuteCleanup).toHaveBeenCalledWith(30)
    })

    it('returns ISO timestamp', async () => {
      mockDryRunCleanup.mockResolvedValueOnce([])
      mockExecuteCleanup.mockResolvedValueOnce({ unpinned: 0, skipped: 0 })

      const result = await runIpfsCleanupJob()

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(() => new Date(result.timestamp)).not.toThrow()
    })

    it('throws error when cleanup service fails', async () => {
      const testError = new Error('IPFS API error')
      mockDryRunCleanup.mockRejectedValueOnce(testError)

      await expect(runIpfsCleanupJob()).rejects.toThrow('IPFS API error')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        'Cleanup job failed',
      )
    })
  })

  describe('handleIpfsCleanupJob', () => {
    it('calls runIpfsCleanupJob', async () => {
      mockDryRunCleanup.mockResolvedValueOnce([])
      mockExecuteCleanup.mockResolvedValueOnce({ unpinned: 0, skipped: 0 })

      await handleIpfsCleanupJob()

      expect(mockDryRunCleanup).toHaveBeenCalled()
    })

    it('propagates errors from runIpfsCleanupJob', async () => {
      const testError = new Error('Database connection lost')
      mockDryRunCleanup.mockRejectedValueOnce(testError)

      await expect(handleIpfsCleanupJob()).rejects.toThrow('Database connection lost')
    })
  })
})
