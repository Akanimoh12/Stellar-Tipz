export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  stellarAddress: string;
  username: string | null;
}

