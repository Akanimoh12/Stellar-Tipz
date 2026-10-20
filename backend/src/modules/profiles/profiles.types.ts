export interface Profile {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  imageUrl: string | null;
  avatarCid: string | null;
  xHandle: string | null;
  creditScore: number | null;
  creditTier: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileResponse {
  id: string;
  stellarAddress: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  imageUrl: string | null;
  avatarCid: string | null;
  xHandle: string | null;
  creditScore: number | null;
  creditTier: string | null;
  createdAt: string;
  updatedAt: string;
  tipsCount: number;
  totalReceived: string;
}

export interface UpdateProfileRequest {
  username?: string;
  displayName?: string;
  bio?: string;
  imageUrl?: string;
  avatarCid?: string;
  xHandle?: string;
  minTipAmount?: string;
}

export interface CreateProfileRequest {
  username: string;
  displayName?: string;
  bio?: string;
  imageUrl?: string;
  avatarCid?: string;
  xHandle?: string;
}
