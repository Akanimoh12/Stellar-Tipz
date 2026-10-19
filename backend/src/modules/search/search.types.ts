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
