import { isIP } from 'net';

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
