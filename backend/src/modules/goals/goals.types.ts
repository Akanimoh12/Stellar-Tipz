/** A single goal response. */
export interface GoalResponse {
  id: string;
  userId: string;
  title: string;
  targetStroops: string;
  raisedStroops: string;
  progress: number;
  deadline: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Paginated goals list response. */
export interface GoalsListResponse {
  data: GoalResponse[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
