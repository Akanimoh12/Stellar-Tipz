export interface GoalResponse {
  id: string;
  userId: string;
  title: string;
  targetStroops: string;
  raisedStroops: string;
  deadline: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalRequest {
  title: string;
  targetStroops: string;
  deadline?: string;
}

export interface UpdateGoalRequest {
  title?: string;
  targetStroops?: string;
  deadline?: string | null;
  status?: 'ACTIVE' | 'CANCELLED';
}

export interface GoalListResponse {
  data: GoalResponse[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
