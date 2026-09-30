import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type DnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

const IPV4_BLOCKS: Array<[number, number]> = [
  [0x00000000, 0xff000000], // 0.0.0.0/8
  [0x0a000000, 0xff000000], // 10/8
  [0x64400000, 0xffc00000], // 100.64/10
  [0x7f000000, 0xff000000], // 127/8
  [0xa9fe0000, 0xffff0000], // 169.254/16
  [0xac100000, 0xfff00000], // 172.16/12
  [0xc0000000, 0xffffff00], // 192.0.0.0/24 (IETF protocol assignments)
  [0xc0000200, 0xffffff00], // 192.0.2.0/24 (documentation)
  [0xc0a80000, 0xffff0000], // 192.168/16
  [0xc6120000, 0xfffe0000], // 198.18/15 (benchmarking)
  [0xc6336400, 0xffffff00], // 198.51.100/24 (documentation)
  [0xcb007100, 0xffffff00], // 203.0.113/24 (documentation)
  [0xe0000000, 0xf0000000], // multicast
  [0xf0000000, 0xf0000000], // reserved
];

function ipv4ToInt(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const values = parts.map(Number);
  if (values.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (
    ((values[0] << 24) >>> 0) |
    (values[1] << 16) |
    (values[2] << 8) |
    values[3]
  ) >>> 0;
}

function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true;
  return IPV4_BLOCKS.some(([network, mask]) => (value & mask) === (network & mask));
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  ) {
    return true;
  }

  // IPv4-mapped IPv6 addresses inherit the IPv4 restrictions. WHATWG URL
  // normalization may render ::ffff:127.0.0.1 as ::ffff:7f00:1, so handle
  // both dotted and compressed-hex representations.
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    const ipv4 = `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
    return isPrivateIpv4(ipv4);
  }

  return false;
}

export function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family === 6) return !isPrivateIpv6(address);
  return false;
}

export function parseWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Webhook URL must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Webhook URL must not contain embedded credentials");
  }
  const hostname = url.hostname.toLowerCase();
  const ipHost =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Webhook URL must use a public hostname");
  }
  if (isIP(ipHost) && !isPublicIp(ipHost)) {
    throw new Error("Webhook URL resolves to a non-public address");
  }
  return url;
}

/**
 * Resolves every address immediately before an outbound request. This check is
 * intentionally repeated at delivery time to defeat DNS rebinding.
 */
export async function assertSafeWebhookUrl(
  raw: string,
  resolver: DnsLookup = lookup as DnsLookup,
): Promise<URL> {
  const url = parseWebhookUrl(raw);
  const hostname =
    url.hostname.startsWith("[") && url.hostname.endsWith("]")
      ? url.hostname.slice(1, -1)
      : url.hostname;

  if (isIP(hostname)) return url;

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolver(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Webhook hostname could not be resolved");
  }

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("Webhook hostname resolved to a non-public address");
  }
  return url;
}

export async function safeWebhookFetch(
  raw: string,
  init: RequestInit,
  options: {
    resolver?: DnsLookup;
    fetchFn?: typeof fetch;
  } = {},
): Promise<Response> {
  const url = await assertSafeWebhookUrl(raw, options.resolver);
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(url, {
    ...init,
    // Do not follow redirects: following would require validating each new
    // target and creates an easy public->private redirect bypass.
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Webhook redirects are not allowed");
  }
  return response;
}
