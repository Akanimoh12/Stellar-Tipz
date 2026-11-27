import { isIP } from 'net';
import { prisma } from '../../db/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/AppError.js';
import type { AuthSession } from './auth.types.js';

/**
 * Shape of per-session metadata captured at refresh-token issuance time.
 */
export interface SessionMetadata {
  device: string;
  ipAddress: string;
}

/**
 * Normalizes and truncates an IP address for privacy.
 */
export function truncateIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const normalized = ip.replace(/^::ffff:/i, '');
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (isIP(normalized) === 6) {
    const groups = normalized.split(':').filter(Boolean).slice(0, 3);
    return `${groups.join(':')}::`;
  }
  return 'unknown';
}

/**
 * Derives coarse device/browser info and a privacy-truncated IP from the
 * request, for display on a "your sessions" screen and for the reuse-
 * detection log line in refreshToken().
 */
export function getSessionMetadata(
  userAgent: string | undefined,
  ip: string | undefined,
): SessionMetadata {
  const browser = userAgent?.match(
    /(Edg|Chrome|Firefox|Safari|Opera)\/?([\d.]+)/i,
  )?.[1];
  const operatingSystem = userAgent?.match(
    /(Windows|Mac OS X|Android|iPhone|iPad|Linux)/i,
  )?.[1];

  return {
    device:
      [browser, operatingSystem].filter(Boolean).join(' on ') ||
      'Unknown device',
    ipAddress: truncateIp(ip),
  };
}

export async function listSessions(
  userId: string,
  currentSessionId: string | undefined,
): Promise<AuthSession[]> {
  const tokens = await prisma.refreshToken.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      sessionId: true,
      device: true,
      ipAddress: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const sessions = new Map<string, AuthSession>();
  for (const token of tokens) {
    const existing = sessions.get(token.sessionId);
    if (existing) {
      if (token.lastUsedAt > new Date(existing.lastUsedAt)) {
        existing.lastUsedAt = token.lastUsedAt.toISOString();
        existing.device = token.device;
        existing.ip = token.ipAddress;
      }
      continue;
    }

    sessions.set(token.sessionId, {
      id: token.sessionId,
      device: token.device,
      ip: token.ipAddress,
      createdAt: token.createdAt.toISOString(),
      lastUsedAt: token.lastUsedAt.toISOString(),
      current: token.sessionId === currentSessionId,
    });
  }

  return [...sessions.values()].sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
  );
}

export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const result = await prisma.refreshToken.updateMany({
    where: {
      userId,
      sessionId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new NotFoundError('Active session not found');
  }
}

export async function revokeOtherSessions(
  userId: string,
  currentSessionId: string | undefined,
): Promise<void> {
  if (!currentSessionId) {
    throw new BadRequestError('Current session identifier is required');
  }

  await prisma.refreshToken.updateMany({
    where: {
      userId,
      sessionId: { not: currentSessionId },
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { revokedAt: new Date() },
  });
}
