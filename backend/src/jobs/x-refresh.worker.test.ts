/**
 * Tests for X metrics refresh worker (issue #1635).
 * Covers quota checking, metrics refresh, and stale data prioritization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
vi.mock('../common/utils/logger.js', () => ({
  logger: mockLogger,
}))

const mockIsQuotaExhausted = vi.fn()
const mockGetXMetrics = vi.fn()
vi.mock('../modules/x/x.service.js', () => ({
  isQuotaExhausted: (...args: unknown[]) => mockIsQuotaExhausted(...args),
  getXMetrics: (...args: unknown[]) => mockGetXMetrics(...args),
}))

const mockFindMany = vi.fn()
const mockUpsert = vi.fn()
const mockPrisma = {
  xLink: { findMany: mockFindMany },
  xAccount: { upsert: mockUpsert },
}
vi.mock('../db/prisma.js', () => ({
  prisma: mockPrisma,
}))

import { runXRefreshJob, handleXRefreshJob } from './x-refresh.worker.js'

describe('X refresh worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runXRefreshJob', () => {
    it('returns quota exhausted early when API is rate limited', async () => {
      mockIsQuotaExhausted.mockResolvedValueOnce(true)

      const result = await runXRefreshJob()

      expect(result.quotaExhausted).toBe(true)
      expect(result.refreshed).toBe(0)
      expect(result.stale).toBe(0)
      expect(mockFindMany).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith('X API quota exhausted, using fallback data only')
    })

    it('refreshes metrics for all unlinked X accounts', async () => {
      mockIsQuotaExhausted.mockResolvedValueOnce(false)
      mockFindMany.mockResolvedValueOnce([
        { xHandle: '@creator1', user: { id: 'user1' } },
        { xHandle: '@creator2', user: { id: 'user2' } },
      ])
      mockGetXMetrics.mockResolvedValue({ followers: 1000, engagement: 50 })
      mockUpsert.mockResolvedValue({})

      const result = await runXRefreshJob()

      expect(result.refreshed).toBe(2)
      expect(result.stale).toBe(0)
      expect(mockGetXMetrics).toHaveBeenCalledWith('@creator1')
      expect(mockGetXMetrics).toHaveBeenCalledWith('@creator2')
    })

    it('upserts xAccount with fresh metrics', async () => {
      mockIsQuotaExhausted.mockResolvedValueOnce(false)
      mockFindMany.mockResolvedValueOnce([
        { xHandle: '@test', user: { id: 'user1' } },
      ])
      mockGetXMetrics.mockResolvedValueOnce({ followers: 5000, engagement: 100 })

      await runXRefreshJob()

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { handle: '@test' },
          create: expect.objectContaining({
            handle: '@test',
            followers: 5000,
            engagement: 100,
            fetchedAt: expect.any(Date),
          }),
          update: expect.objectContaining({
            followers: 5000,
            engagement: 100,
            fetchedAt: expect.any(Date),
          }),
        }),
      )
    })

    it('counts failed refreshes as stale', async () => {
      mockIsQuotaExhausted.mockResolvedValueOnce(false)
      mockFindMany.mockResolvedValueOnce([
        { xHandle: '@success', user: { id: 'user1' } },
        { xHandle: '@fail', user: { id: 'user2' } },
      ])
      mockGetXMetrics
        .mockResolvedValueOnce({ followers: 1000, engagement: 50 })
        .mockRejectedValueOnce(new Error('Network error'))

      const result = await runXRefreshJob()

      expect(result.refreshed).toBe(1)
      expect(result.stale).toBe(1)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ xHandle: '@fail' }),
        'Failed to refresh X metrics',
      )
    })

    it('logs debug message for each successful refresh', async () => {
      mockIsQuotaExhausted.mockResolvedValueOnce(false)
      mockFindMany.mockResolvedValueOnce([
        { xHandle: '@creator', user: { id: 'user1' } },
      ])
      mockGetXMetrics.mockResolvedValueOnce({ followers: 1000, engagement: 50 })
      mockUpsert.mockResolvedValueOnce({})

      await runXRefreshJob()

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { xHandle: '@creator' },
        'Refreshed X metrics',
      )
    })

    it('returns ISO timestamp', async () => {
      mockIsQuotaExhausted.mockResolvedValueOnce(false)
      mockFindMany.mockResolvedValueOnce([])

      const result = await runXRefreshJob()

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(() => new Date(result.timestamp)).not.toThrow()
    })

    it('throws error when find many fails', async () => {
      mockIsQuotaExhausted.mockResolvedValueOnce(false)
      const dbError = new Error('Database unreachable')
      mockFindMany.mockRejectedValueOnce(dbError)

      await expect(runXRefreshJob()).rejects.toThrow('Database unreachable')
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: dbError },
        'X refresh job failed',
      )
    })
  })

  describe('handleXRefreshJob', () => {
    it('calls runXRefreshJob', async () => {
      mockIsQuotaExhausted.mockResolvedValueOnce(false)
      mockFindMany.mockResolvedValueOnce([])

      await handleXRefreshJob()

      expect(mockIsQuotaExhausted).toHaveBeenCalled()
    })

    it('propagates errors from runXRefreshJob', async () => {
      const testError = new Error('Service error')
      mockIsQuotaExhausted.mockRejectedValueOnce(testError)

      await expect(handleXRefreshJob()).rejects.toThrow('Service error')
    })
  })
})
