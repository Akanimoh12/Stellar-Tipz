/**
 * Admin module types.
 */

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface PlatformStats {
  totalUsers: number;
  totalCreators: number;
  totalTips: number;
  totalTipAmountStroops: bigint;
  activeUsersLast30Days: number;
  totalSubscriptions: number;
  totalRefunds: number;
  averageTipAmount: string;
}
