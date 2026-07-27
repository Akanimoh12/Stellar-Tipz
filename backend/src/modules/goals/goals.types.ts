/**
 * Shared types for the goals module.
 *
 * Covers goals CRUD, progress calculation, and completion detection + notification.
 */

/** Lifecycle status of a creator funding goal. Mirrors the Prisma enum. */
export type GoalStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

/** Full goal object returned from the service layer. */
export interface Goal {
  id: string;
  userId: string;
  title: string;
  /** Target amount in stroops (the smallest unit on Stellar). */
  targetStroops: string;
  /** Amount raised so far, in stroops. */
  raisedStroops: string;
  /** Optional ISO-8601 deadline. */
  deadline: string | null;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

/** Goal enriched with computed progress fields. */
export interface GoalProgress extends Goal {
  /** Percentage of target raised, clamped to [0, 100]. */
  raisedPercentage: number;
  /** True when raisedStroops >= targetStroops. */
  isComplete: boolean;
  /** Days until deadline (null if no deadline set). */
  daysRemaining: number | null;
}

/** Input for creating a new goal. */
export interface CreateGoalRequest {
  title: string;
  /** Target amount as a decimal string (will be converted to BigInt stroops). */
  targetStroops: string;
  /** Optional ISO-8601 deadline string. */
  deadline?: string;
}

/** Input for updating an existing goal. All fields optional. */
export interface UpdateGoalRequest {
  title?: string;
  targetStroops?: string;
  deadline?: string | null;
  status?: GoalStatus;
}

/** API response envelope for a single goal. */
export interface GoalResponse {
  data: Goal;
}

/** API response envelope for goal progress. */
export interface GoalProgressResponse {
  data: GoalProgress;
}

/** API response envelope for a paginated goal list. */
export interface GoalListResponse {
  data: Goal[];
  total: number;
  page: number;
  limit: number;
}
