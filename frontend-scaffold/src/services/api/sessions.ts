import { apiFetch } from "./client";

export interface ActiveSession {
  id: string;
  device: string;
  ip: string;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
}

export async function fetchActiveSessions(): Promise<ActiveSession[]> {
  const response = await apiFetch<{ sessions: ActiveSession[] }>("/auth/sessions");
  return response.sessions;
}

export async function revokeActiveSession(sessionId: string): Promise<void> {
  await apiFetch(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}
