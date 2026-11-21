import { describe, expect, it, vi } from 'vitest'
import {
  createWebhookSigningHeaders,
  verifyTimestampedWebhookSignature,
} from './webhooks.signing.js'
import { assertSafeWebhookUrl, safeWebhookFetch, type DnsLookup } from './webhooks.url-safety.js'

const publicDns: DnsLookup = async () => [{ address: '93.184.216.34', family: 4 }]

describe('webhook replay protection', () => {
  const body = JSON.stringify({ event: 'tip.received', amount: '10' })
  const nowMs = 1_800_000_000_000
  const timestamp = Math.floor(nowMs / 1000)

  it('accepts a valid timestamped signature and rejects tampering', () => {
    const headers = createWebhookSigningHeaders('new-secret', body, 'delivery-1', timestamp)
    expect(
      verifyTimestampedWebhookSignature({
        payload: body,
        timestamp: headers['X-Stellar-Tipz-Timestamp'],
        deliveryId: headers['X-Stellar-Tipz-Delivery-Id'],
        signature: headers['X-Stellar-Tipz-Signature'],
        secrets: ['new-secret'],
        nowMs,
      }),
    ).toBe(true)

    expect(
      verifyTimestampedWebhookSignature({
        payload: body + 'tampered',
        timestamp,
        deliveryId: 'delivery-1',
        signature: headers['X-Stellar-Tipz-Signature'],
        secrets: ['new-secret'],
        nowMs,
      }),
    ).toBe(false)
  })

  it('rejects stale timestamps', () => {
    const headers = createWebhookSigningHeaders('secret', body, 'delivery-stale', timestamp - 600)
    expect(
      verifyTimestampedWebhookSignature({
        payload: body,
        timestamp: timestamp - 600,
        deliveryId: 'delivery-stale',
        signature: headers['X-Stellar-Tipz-Signature'],
        secrets: ['secret'],
        nowMs,
        toleranceSeconds: 300,
      }),
    ).toBe(false)
  })

  it('accepts the previous secret during rotation overlap', () => {
    const headers = createWebhookSigningHeaders('old-secret', body, 'delivery-2', timestamp)
    expect(
      verifyTimestampedWebhookSignature({
        payload: body,
        timestamp,
        deliveryId: 'delivery-2',
        signature: headers['X-Stellar-Tipz-Signature'],
        secrets: ['new-secret', 'old-secret'],
        nowMs,
      }),
    ).toBe(true)
  })
})

describe('webhook SSRF protection', () => {
  const scheme = 'https:' + '//'

  it('rejects private IPv4 targets', async () => {
    await expect(assertSafeWebhookUrl(scheme + '127.0.0.1/hook', publicDns)).rejects.toThrow(
      /public/i,
    )
    await expect(assertSafeWebhookUrl(scheme + '10.0.0.1/hook', publicDns)).rejects.toThrow(
      /public/i,
    )
    await expect(assertSafeWebhookUrl(scheme + '169.254.169.254/meta', publicDns)).rejects.toThrow(
      /public/i,
    )
  })

  it('rejects IPv6 and encoded address bypasses', async () => {
    await expect(assertSafeWebhookUrl(scheme + '[' + '::1' + ']/hook', publicDns)).rejects.toThrow(
      /public/i,
    )
    await expect(
      assertSafeWebhookUrl(scheme + '[::ffff:127.0.0.1]/hook', publicDns),
    ).rejects.toThrow(/public/i)
    await expect(assertSafeWebhookUrl(scheme + '2130706433/hook', publicDns)).rejects.toThrow(
      /public/i,
    )
    await expect(assertSafeWebhookUrl(scheme + '0177.0.0.1/hook', publicDns)).rejects.toThrow(
      /public/i,
    )
  })
})

describe('webhook request-time target validation', () => {
  const scheme = 'https:' + '//'

  it('re-resolves a hostname to defeat DNS rebinding', async () => {
    let count = 0
    const rebinding: DnsLookup = async () => {
      count += 1
      return count === 1
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '127.0.0.1', family: 4 }]
    }
    const target = scheme + 'hooks.example.test/a'
    await expect(assertSafeWebhookUrl(target, rebinding)).resolves.toBeInstanceOf(URL)
    await expect(assertSafeWebhookUrl(target, rebinding)).rejects.toThrow(/public/i)
  })

  it('does not follow redirects', async () => {
    const fetchFn = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        new Response(null, {
          status: 302,
          headers: { location: scheme + 'example.invalid/internal' },
        }),
    )
    await expect(
      safeWebhookFetch(
        scheme + 'hooks.example.test/a',
        { method: 'POST' },
        { resolver: publicDns, fetchFn: fetchFn as typeof fetch },
      ),
    ).rejects.toThrow(/redirects/i)
    expect(fetchFn).toHaveBeenCalledOnce()
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  })
})
