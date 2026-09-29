export type AvatarSize = "sm" | "md" | "lg" | "xl";

export const AVATAR_DIMENSIONS: Record<AvatarSize, number> = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
};

const IPFS_GATEWAY_ORIGIN = "https://ipfs.io/ipfs/";
const IMAGE_OPTIMIZER_ORIGIN = "https://images.weserv.nl/";
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})/i;

function isDataOrBlobUrl(src: string): boolean {
  return src.startsWith("data:") || src.startsWith("blob:");
}

export function normalizeAvatarSrc(src?: string): string | undefined {
  const trimmed = src?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (isDataOrBlobUrl(trimmed) || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("ipfs://")) {
    return `${IPFS_GATEWAY_ORIGIN}${trimmed.slice("ipfs://".length)}`;
  }

  if (CID_PATTERN.test(trimmed)) {
    return `${IPFS_GATEWAY_ORIGIN}${trimmed}`;
  }

  return trimmed;
}

function isIpfsSource(rawSrc: string, normalizedSrc: string): boolean {
  return (
    rawSrc.startsWith("ipfs://") ||
    CID_PATTERN.test(rawSrc) ||
    /\/ipfs\//i.test(normalizedSrc)
  );
}

function toOptimizerUrl(
  src: string,
  width: number,
  format: "webp" | "jpg",
): string {
  const withoutProtocol = src.replace(/^https?:\/\//i, "");
  const params = new URLSearchParams({
    url: withoutProtocol,
    w: String(width),
    h: String(width),
    fit: "cover",
    output: format,
  });

  return `${IMAGE_OPTIMIZER_ORIGIN}?${params.toString()}`;
}

export function getAvatarSrcSet(
  rawSrc: string | undefined,
  displaySize: AvatarSize,
  format: "webp" | "jpg" = "webp",
): string | undefined {
  const normalizedSrc = normalizeAvatarSrc(rawSrc);
  const trimmedSrc = rawSrc?.trim();

  if (!trimmedSrc || !normalizedSrc || isDataOrBlobUrl(normalizedSrc)) {
    return undefined;
  }

  if (!isIpfsSource(trimmedSrc, normalizedSrc)) {
    return undefined;
  }

  const baseWidth = AVATAR_DIMENSIONS[displaySize];
  return [baseWidth, baseWidth * 2]
    .map((width) => `${toOptimizerUrl(normalizedSrc, width, format)} ${width}w`)
    .join(", ");
}

export function getAvatarSizes(displaySize: AvatarSize): string {
  return `${AVATAR_DIMENSIONS[displaySize]}px`;
}
