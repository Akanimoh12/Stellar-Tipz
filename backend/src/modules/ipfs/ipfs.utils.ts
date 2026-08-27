import { config } from "../../config/index.js";
import { BadRequestError } from "../../common/errors/AppError.js";
import { cidRegex } from "./ipfs.schema.js";

/**
 * Checks whether a given string is a valid IPFS Content Identifier (CID).
 *
 * @param cid String to validate.
 * @returns Boolean indicating CID validity.
 */
export function isValidCid(cid: string): boolean {
  if (!cid || typeof cid !== "string") {
    return false;
  }
  const cleanCid = cid.trim().replace(/^\/?(ipfs\/)?/, "");
  return cidRegex.test(cleanCid);
}

/**
 * Builds a resolvable IPFS gateway URL from a Content Identifier (CID).
 *
 * @param cid IPFS Content Identifier (CIDv0 or CIDv1).
 * @param gatewayBaseUrl Optional custom gateway URL override.
 * @returns Fully qualified HTTP URL pointing to the IPFS resource.
 * @throws BadRequestError if the provided CID is invalid or empty.
 */
export function buildGatewayUrl(cid: string, gatewayBaseUrl?: string): string {
  if (!cid || typeof cid !== "string" || !cid.trim()) {
    throw new BadRequestError("IPFS CID is required");
  }

  // Clean CID: strip accidental leading slashes or 'ipfs/' prefix
  let cleanCid = cid.trim();
  if (cleanCid.startsWith("/")) {
    cleanCid = cleanCid.slice(1);
  }
  if (cleanCid.startsWith("ipfs/")) {
    cleanCid = cleanCid.slice(5);
  }

  if (!isValidCid(cleanCid)) {
    throw new BadRequestError(`Invalid IPFS CID format: ${cid}`);
  }

  const base = (gatewayBaseUrl || config.ipfs.gatewayUrl || "https://ipfs.io/ipfs/").trim();
  
  // Ensure base ends with a slash, unless it already includes trailing slash
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  return `${normalizedBase}${cleanCid}`;
}
