/**
 * Type definitions for X (Twitter) integration (issues #1294, #1293).
 */

export type ProofType = "oauth" | "post_nonce";

export interface LinkXAccountRequest {
  xHandle: string;
  proofType: ProofType | string;
  proofData: string;
}

export interface LinkXAccountResponse {
  success: boolean;
  message: string;
  xHandle?: string;
  linkedAt?: string;
}

export interface XMetrics {
  handle: string;
  followers: number;
  engagement?: number;
  fetchedAt: string;
  isStale?: boolean;
  staleAge?: number;
}

export interface QuotaStatus {
  requestsUsed: number;
  requestsLimit: number;
  resetAt: string;
  isExhausted: boolean;
}

export interface AuditLogEntry {
  action: "link" | "unlink" | "verify_proof";
  userId: string;
  xHandle: string;
  proofType?: string;
  success: boolean;
  timestamp: string;
  details?: Record<string, unknown>;
}
