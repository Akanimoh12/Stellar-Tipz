import crypto from "node:crypto";
import sharp from "sharp";
import { config } from "../../config/index.js";
import { logger } from "../../common/utils/logger.js";
import {
  BadRequestError,
  BadGatewayError,
  ServiceUnavailableError,
} from "../../common/errors/AppError.js";
import { buildGatewayUrl } from "./ipfs.utils.js";
import { fetchWithTimeout } from "../../common/utils/fetchWithTimeout.js";
import type { IpfsUploadResponse } from "./ipfs.types.js";

/** Default max file size limit for image uploads (5 MB) */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum allowed pixel width/height for an uploaded image (issue #1232) */
export const MAX_IMAGE_DIMENSION_PX = 4096;

/**
 * Raster formats accepted for uploads, matched against the format sharp
 * actually decodes from the file's magic bytes — never the client-supplied
 * MIME type or filename extension. SVG is deliberately excluded: it is a
 * markup format capable of carrying scripts, so it cannot be "verified" the
 * same way a raster image can (issue #1232).
 */
const ALLOWED_IMAGE_FORMATS = ["jpeg", "png", "gif", "webp"] as const;
type AllowedImageFormat = (typeof ALLOWED_IMAGE_FORMATS)[number];

const FORMAT_TO_MIME_TYPE: Record<AllowedImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/** Legacy export kept for callers that need a human-readable allowlist. */
export const ALLOWED_IMAGE_MIME_TYPES = Object.values(FORMAT_TO_MIME_TYPE);

export interface SanitizedImage {
  /** Re-encoded image bytes with all metadata (EXIF/GPS) stripped. */
  buffer: Buffer;
  mimeType: string;
  format: AllowedImageFormat;
  width: number;
  height: number;
}

/**
 * Verifies an uploaded image by its actual decoded content and returns a
 * sanitized, re-encoded copy safe to pin (issue #1232).
 *
 * - File type is verified by magic bytes (via sharp/libvips format
 *   detection), never by the client-supplied MIME type or file extension.
 * - Only a fixed allowlist of raster formats is accepted; SVG is rejected
 *   outright since it cannot be decoded into pixels the same way.
 * - Dimensions are bounded to guard against decompression-bomb style images.
 * - The output is a fresh re-encode of the decoded pixels, which drops all
 *   EXIF/IPTC/XMP metadata (including GPS) and any bytes that do not belong
 *   to the actual image data — the standard defense against polyglot files
 *   that smuggle a payload past a format's end-of-data marker.
 *
 * @throws BadRequestError if the file is missing, unreadable, not an
 *   allowed format, or exceeds the size/dimension limits.
 */
export async function verifyAndSanitizeImage(file?: {
  size: number;
  buffer: Buffer;
}): Promise<SanitizedImage> {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestError("No image file provided");
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new BadRequestError(
      `File size exceeds maximum limit of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`
    );
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(file.buffer).metadata();
  } catch {
    throw new BadRequestError(
      "File content could not be verified as a valid image. It may be corrupt, an unsupported format, or not an image at all."
    );
  }

  const format = metadata.format;
  if (!format || !(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(format)) {
    throw new BadRequestError(
      `Unsupported or unverifiable image format '${format ?? "unknown"}'. Allowed types: ${ALLOWED_IMAGE_FORMATS.join(", ")}`
    );
  }
  const verifiedFormat = format as AllowedImageFormat;

  if (!metadata.width || !metadata.height) {
    throw new BadRequestError("Unable to determine image dimensions");
  }
  if (metadata.width > MAX_IMAGE_DIMENSION_PX || metadata.height > MAX_IMAGE_DIMENSION_PX) {
    throw new BadRequestError(
      `Image dimensions (${metadata.width}x${metadata.height}) exceed the maximum of ${MAX_IMAGE_DIMENSION_PX}x${MAX_IMAGE_DIMENSION_PX}px`
    );
  }

  try {
    const sanitizedBuffer = await sharp(file.buffer, { animated: verifiedFormat === "gif" })
      .rotate() // bake in EXIF orientation before metadata is dropped
      .toFormat(verifiedFormat)
      .toBuffer();

    return {
      buffer: sanitizedBuffer,
      mimeType: FORMAT_TO_MIME_TYPE[verifiedFormat],
      format: verifiedFormat,
      width: metadata.width,
      height: metadata.height,
    };
  } catch {
    throw new BadRequestError("Failed to process image file");
  }
}

/**
 * Generates a fallback mock CID (CIDv0 format starting with Qm) for development
 * or test environments when IPFS API node is unconfigured or unreachable.
 *
 * @param buffer File content buffer.
 * @returns Valid base58-like string formatted as CIDv0.
 */
export function generateFallbackCid(buffer: Buffer): string {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  // Map hex hash to a 44-character base58-compatible string starting with Qm
  const base58Chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let mockBody = "";
  for (let i = 0; i < 44; i++) {
    const charIndex = parseInt(hash.substring((i % 16) * 2, (i % 16) * 2 + 2), 16) % base58Chars.length;
    mockBody += base58Chars[charIndex];
  }
  return `Qm${mockBody}`;
}

/**
 * Uploads and pins an image file to IPFS.
 * Handles HTTP pinning requests to IPFS API endpoints and gracefully handles failures.
 *
 * @param file Uploaded image file object containing buffer, mimetype, and size.
 * @returns Object containing CID and resolvable gateway URL.
 * @throws BadRequestError, BadGatewayError, or ServiceUnavailableError.
 */
export async function pinImageToIpfs(
  file: {
    mimetype: string;
    size: number;
    buffer: Buffer;
    originalname?: string;
  },
  opts: { signal?: AbortSignal } = {},
): Promise<IpfsUploadResponse> {
  // 1. Verify the file is actually an allowed image type (by magic bytes, not
  //    the client-supplied MIME type) and get back a re-encoded, metadata-stripped
  //    copy of it — this is what gets pinned, never the original upload (issue #1232).
  const sanitized = await verifyAndSanitizeImage(file);

  const ipfsApiUrl = config.ipfs.apiUrl;

  // 2. If IPFS_API_URL is unconfigured, handle fallback cleanly
  if (!ipfsApiUrl || !ipfsApiUrl.trim()) {
    logger.warn("IPFS_API_URL not configured. Using fallback CID generation mode.");
    const fallbackCid = generateFallbackCid(sanitized.buffer);
    const gatewayUrl = buildGatewayUrl(fallbackCid);
    return {
      cid: fallbackCid,
      url: gatewayUrl,
      size: sanitized.buffer.length,
      mimeType: sanitized.mimeType,
    };
  }

  // 3. Pin image via IPFS HTTP API endpoint (explicit timeout + client disconnect — issue #090)
  try {
    const formData = new globalThis.FormData();
    const blob = new globalThis.Blob([sanitized.buffer], { type: sanitized.mimeType });
    formData.append("file", blob, file.originalname || `image.${sanitized.format}`);

    const endpoint = `${ipfsApiUrl.replace(/\/+$/, "")}/api/v0/add?pin=true`;
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      body: formData,
      timeoutMs: (config as unknown as { timeouts?: { ipfsMs: number } })?.timeouts?.ipfsMs ?? 15_000,
      parentSignal: opts.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown IPFS error");
      logger.error(
        { status: response.status, errorText, endpoint },
        "IPFS pinning HTTP request failed"
      );

      // Fallback strategy (#984): if in dev/test, fallback gracefully; in prod throw BadGatewayError
      if ((config as unknown as { server?: { nodeEnv: string } })?.server?.nodeEnv !== "production") {
        logger.warn("Non-production environment: falling back after IPFS pinning HTTP error.");
        const fallbackCid = generateFallbackCid(sanitized.buffer);
        return {
          cid: fallbackCid,
          url: buildGatewayUrl(fallbackCid),
          size: sanitized.buffer.length,
          mimeType: sanitized.mimeType,
        };
      }

      throw new BadGatewayError(`IPFS pinning service failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { Hash?: string; cid?: string; Name?: string };
    const cid = data.Hash || data.cid;

    if (!cid) {
      logger.error({ data }, "IPFS response missing CID/Hash field");
      throw new BadGatewayError("IPFS response missing CID identifier");
    }

    const url = buildGatewayUrl(cid);
    logger.info({ cid, url }, "Image successfully pinned to IPFS");

    return {
      cid,
      url,
      size: sanitized.buffer.length,
      mimeType: sanitized.mimeType,
    };
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof BadGatewayError) {
      throw error;
    }

    // Timeout vs cancellation mapping (issue #090)
    if (error instanceof DOMException && error.name === "TimeoutError") {
      logger.warn({ endpoint: `${ipfsApiUrl}/api/v0/add`, timeoutMs: (config as unknown as { timeouts?: { ipfsMs: number } })?.timeouts?.ipfsMs ?? 15_000 }, "IPFS pinning timed out");
      if ((config as unknown as { server?: { nodeEnv: string } })?.server?.nodeEnv !== "production") {
        const fallbackCid = generateFallbackCid(sanitized.buffer);
        return { cid: fallbackCid, url: buildGatewayUrl(fallbackCid), size: sanitized.buffer.length, mimeType: sanitized.mimeType };
      }
      throw new ServiceUnavailableError(`IPFS pinning timed out after ${(config as unknown as { timeouts?: { ipfsMs: number } })?.timeouts?.ipfsMs ?? 15_000}ms`);
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      logger.debug("IPFS pinning aborted (client disconnect)");
      throw new ServiceUnavailableError("IPFS pinning cancelled");
    }

    logger.error({ error }, "Error communicating with IPFS pinning service");

    // Fallback handling (#984): network exception / timeout fallback for non-prod
    if ((config as unknown as { server?: { nodeEnv: string } })?.server?.nodeEnv !== "production") {
      logger.warn("Non-production environment: fallback CID generated after IPFS failure.");
      const fallbackCid = generateFallbackCid(sanitized.buffer);
      return {
        cid: fallbackCid,
        url: buildGatewayUrl(fallbackCid),
        size: sanitized.buffer.length,
        mimeType: sanitized.mimeType,
      };
    }

    throw new ServiceUnavailableError(
      "Unable to connect to IPFS pinning service",
      error instanceof Error ? error.message : undefined
    );
  }
}
