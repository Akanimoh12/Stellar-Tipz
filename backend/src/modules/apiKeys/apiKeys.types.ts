export interface ApiKeyResponse {
  id: string;
  scopes: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyInput {
  scopes: string[];
  expiresAt?: string;
}

export interface CreateApiKeyResponse extends ApiKeyResponse {
  secret: string;
}

export interface RotateApiKeyInput {
  gracePeriodMinutes?: number;
}

export interface RotateApiKeyResponse {
  id: string;
  scopes: string[];
  secret: string;
  graceExpiresAt: string;
  createdAt: string;
}
