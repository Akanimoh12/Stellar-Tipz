export interface OgData {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  creditTier?: string;
  totalTipsStroops?: string | number | bigint;
}

const WIDTH = 1200;
const HEIGHT = 630;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds the OG image SVG markup. Pure and side-effect free (unit-testable).
 * Rasterization to PNG happens separately in `ogRenderer`.
 */
export function buildOgSvg(data: OgData): string {
  const name = escapeXml(data.displayName || data.username || 'Creator');
  const handle = escapeXml(`@${data.username || 'unknown'}`);
  const tier = escapeXml(data.creditTier || 'New');
  // Format stroops as XLM with 2 decimals for readability.
  const stroops = BigInt(data.totalTipsStroops || '0');
  const xlm = Number(stroops) / 10_000_000;
  const tipsLabel = escapeXml(
    `${xlm.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM tipped`,
  );

  const avatar = data.avatarUrl
    ? `<clipPath id="avatarClip"><circle cx="150" cy="315" r="90" /></clipPath>
       <image href="${escapeXml(data.avatarUrl)}" x="60" y="225" width="180" height="180" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />
       <circle cx="150" cy="315" r="90" fill="none" stroke="#7c5cff" stroke-width="4" />`
    : `<circle cx="150" cy="315" r="90" fill="#2a2350" stroke="#7c5cff" stroke-width="4" />
       <text x="150" y="335" font-size="80" fill="#fff" text-anchor="middle" font-family="sans-serif">${name.charAt(0).toUpperCase()}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1535" />
      <stop offset="100%" stop-color="#0e0b1f" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  ${avatar}
  <text x="300" y="300" font-size="64" fill="#ffffff" font-family="sans-serif" font-weight="700">${name}</text>
  <text x="300" y="360" font-size="36" fill="#b9b3e6" font-family="sans-serif">${handle}</text>
  <rect x="300" y="400" width="${220 + tier.length * 18}" height="56" rx="28" fill="#7c5cff" />
  <text x="320" y="438" font-size="32" fill="#ffffff" font-family="sans-serif" font-weight="600">${tier} creator</text>
  <text x="300" y="540" font-size="40" fill="#f5f3ff" font-family="sans-serif">${tipsLabel}</text>
  <text x="1130" y="590" text-anchor="end" font-size="30" fill="#6f68a8" font-family="sans-serif">Stellar Tipz</text>
</svg>`;
}
