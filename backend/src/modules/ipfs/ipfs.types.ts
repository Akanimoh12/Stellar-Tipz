/**
 * Response payload returned when an image is successfully uploaded and pinned to IPFS.
 */
export interface IpfsUploadResponse {
  cid: string;
  url: string;
  size?: number;
  mimeType?: string;
}

/**
 * Result of pinning content to IPFS.
 */
export interface IpfsPinResult {
  cid: string;
  url: string;
}

/**
 * Response payload for gateway URL resolution requests.
 */
export interface IpfsGatewayResponse {
  cid: string;
  url: string;
}

/**
 * Validation configuration options for IPFS image uploads.
 */
export interface IpfsValidationOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}
