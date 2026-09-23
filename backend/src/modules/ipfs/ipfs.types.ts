/**
 * Type definitions for IPFS service (issues #1295, #1296).
 */

export enum UploadStatus {
  PENDING = "pending",
  PINNED = "pinned",
  FAILED = "failed",
  UNPINNED = "unpinned",
}

export interface UploadMetadata {
  userId: string;
  entityType?: string;
  entityId?: string;
}

export interface PinResult {
  success: boolean;
  cid: string;
  message?: string;
  retryable?: boolean;
}

export interface VerifyPinResult {
  exists: boolean;
  cid: string;
  gateway?: string;
}

export interface GatewayConfig {
  url: string;
  priority: number;
  timeout: number;
}
