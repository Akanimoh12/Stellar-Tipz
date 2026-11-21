/**
 * Tests for IPFS pin verification worker (issue #1635).
 * Covers cleanup, verification, and retry queuing logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
vi.mock('../common/utils/logger.js', () => ({
  logger: mockLogger,
}))

const mockVerifyAllPins = vi.fn()
vi.mock('../modules/ipfs/ipfs.service.js', () => ({
  verifyAllPins: (...args: unknown[]) => mockVerifyAllPins(...args),
}))

import { runIpfsVerifyJob, handleIpfsVerifyJob } from './ipfs-verify.worker.js'

describe('IPFS verification worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runIpfsVerifyJob', () => {
    it('returns verified and failed counts on success', async () => {
      mockVerifyAllPins.mockResolvedValueOnce({
        verified: 42,
        failed: 3,
      })

      const result = await runIpfsVerifyJob()

      expect(result.verified).toBe(42)
      expect(result.failed).toBe(3)
      expect(result.timestamp).toBeDefined()
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ verified: 42, failed: 3 }),
        'IPFS verification job completed',
      )
    })

    it('logs warning when pins fail verification', async () => {
      mockVerifyAllPins.mockResolvedValueOnce({
        verified: 100,
        failed: 5,
      })

      await runIpfsVerifyJob()

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ failed: 5 }),
        'Some pins failed verification and were queued for retry',
      )
    })

    it('does not log warning when all pins verify', async () => {
      mockVerifyAllPins.mockResolvedValueOnce({
        verified: 100,
        failed: 0,
      })

      await runIpfsVerifyJob()

      expect(mockLogger.warn).not.toHaveBeenCalled()
    })

    it('throws error when verification service fails', async () => {
      const testError = new Error('IPFS connection failed')
      mockVerifyAllPins.mockRejectedValueOnce(testError)

      await expect(runIpfsVerifyJob()).rejects.toThrow('IPFS connection failed')
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: testError }),
        'IPFS verification job failed',
      )
    })

    it('returns ISO timestamp', async () => {
      mockVerifyAllPins.mockResolvedValueOnce({
        verified: 10,
        failed: 0,
      })

      const result = await runIpfsVerifyJob()

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(() => new Date(result.timestamp)).not.toThrow()
    })
  })

  describe('handleIpfsVerifyJob', () => {
    it('calls runIpfsVerifyJob', async () => {
      mockVerifyAllPins.mockResolvedValueOnce({
        verified: 50,
        failed: 2,
      })

      await handleIpfsVerifyJob()

      expect(mockVerifyAllPins).toHaveBeenCalled()
    })

    it('propagates errors from runIpfsVerifyJob', async () => {
      const testError = new Error('Service unavailable')
      mockVerifyAllPins.mockRejectedValueOnce(testError)

      await expect(handleIpfsVerifyJob()).rejects.toThrow('Service unavailable')
    })
  })
})
