import { apiFetch } from "./client";
import type { FavoriteCreator } from "../../types/favorites";

/** Enriched fields the backend may include (#060 GET /favorites). */
export interface ServerFavorite extends Partial<FavoriteCreator> {
  address: string;
  username: string;
  avatar?: string;
  creditScore?: number;
}

function normalizeFavorite(raw: unknown): FavoriteCreator | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.username !== "string" || typeof o.address !== "string") {
    return null;
  }
  return {
    address: o.address,
    username: o.username,
    addedAt: typeof o.addedAt === "number" ? o.addedAt : Date.now(),
    tipCount: typeof o.tipCount === "number" ? o.tipCount : 0,
  };
}

function normalizeList(data: unknown): FavoriteCreator[] {
  const rows: unknown[] = Array.isArray(data)
    ? data
    : data &&
      typeof data === "object" &&
      Array.isArray((data as { favorites?: unknown[] }).favorites)
    ? (data as { favorites: unknown[] }).favorites
    : [];
  return rows
    .map(normalizeFavorite)
    .filter((f): f is FavoriteCreator => f !== null);
}

/** GET /favorites — server list for the authenticated user. */
export async function fetchFavorites(): Promise<FavoriteCreator[]> {
  const data = await apiFetch<unknown>("/favorites");
  return normalizeList(data);
}

/** POST /favorites/:username — idempotent on the (user, creator) unique key. */
export async function addFavoriteToServer(username: string): Promise<void> {
  await apiFetch(`/favorites/${encodeURIComponent(username)}`, {
    method: "POST",
  });
}

/** DELETE /favorites/:username */
export async function removeFavoriteFromServer(
  username: string,
): Promise<void> {
  await apiFetch(`/favorites/${encodeURIComponent(username)}`, {
    method: "DELETE",
  });
}
