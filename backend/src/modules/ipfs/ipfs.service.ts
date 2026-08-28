import crypto from "node:crypto";
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

/** Supported image MIME types */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

/**
 * Validates an uploaded image file for MIME type and size constraints.
 *
 * @param file Express Multer file object or raw file buffer with metadata.
 * @throws BadRequestError if the file is missing, unsupported, or exceeds size limits.
 */
export function validateImageFile(file?: {
  mimetype: string;
  size: number;
  buffer: Buffer;
}): void {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestError("No image file provided");
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    throw new BadRequestError(
      `Unsupported file type '${file.mimetype}'. Allowed types: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}`
    );
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new BadRequestError(
      `File size exceeds maximum limit of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`
    );
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
  // 1. Validate file format and constraints
  validateImageFile(file);

  const ipfsApiUrl = config.ipfs.apiUrl;

  // 2. If IPFS_API_URL is unconfigured, handle fallback cleanly
  if (!ipfsApiUrl || !ipfsApiUrl.trim()) {
    logger.warn("IPFS_API_URL not configured. Using fallback CID generation mode.");
    const fallbackCid = generateFallbackCid(file.buffer);
    const gatewayUrl = buildGatewayUrl(fallbackCid);
    return {
      cid: fallbackCid,
      url: gatewayUrl,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  // 3. Pin image via IPFS HTTP API endpoint (explicit timeout + client disconnect — issue #090)
  try {
    const formData = new globalThis.FormData();
    const blob = new globalThis.Blob([file.buffer], { type: file.mimetype });
    formData.append("file", blob, file.originalname || "image");

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
        const fallbackCid = generateFallbackCid(file.buffer);
        return {
          cid: fallbackCid,
          url: buildGatewayUrl(fallbackCid),
          size: file.size,
          mimeType: file.mimetype,
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
      size: file.size,
      mimeType: file.mimetype,
    };
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof BadGatewayError) {
      throw error;
    }

    // Timeout vs cancellation mapping (issue #090)
    if (error instanceof DOMException && error.name === "TimeoutError") {
      logger.warn({ endpoint: `${ipfsApiUrl}/api/v0/add`, timeoutMs: (config as unknown as { timeouts?: { ipfsMs: number } })?.timeouts?.ipfsMs ?? 15_000 }, "IPFS pinning timed out");
      if ((config as unknown as { server?: { nodeEnv: string } })?.server?.nodeEnv !== "production") {
        const fallbackCid = generateFallbackCid(file.buffer);
        return { cid: fallbackCid, url: buildGatewayUrl(fallbackCid), size: file.size, mimeType: file.mimetype };
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
      const fallbackCid = generateFallbackCid(file.buffer);
      return {
        cid: fallbackCid,
        url: buildGatewayUrl(fallbackCid),
        size: file.size,
        mimeType: file.mimetype,
      };
    }

    throw new ServiceUnavailableError(
      "Unable to connect to IPFS pinning service",
      error instanceof Error ? error.message : undefined
    );
  }
}
