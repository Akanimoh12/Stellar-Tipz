/** A single creator search result. */
export interface SearchCreator {
  id: string;
  username: string | null;
  displayName: string | null;
  stellarAddress: string;
  imageUrl: string | null;
  bio: string | null;
}

/** Paginated creator search response. */
export interface SearchCreatorsResponse {
  data: SearchCreator[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/** A single trending creator entry (issue #1016). */
export interface TrendingCreatorEntry {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string | null;
  stellarAddress: string;
  imageUrl: string | null;
  bio: string | null;
  totalTipsStroops: string;
  tipCount: number;
}

/** Trending creators response (issue #1016). */
export interface TrendingCreatorsResponse {
  data: TrendingCreatorEntry[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  window: string;
}
