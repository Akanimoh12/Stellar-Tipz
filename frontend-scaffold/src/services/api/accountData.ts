import { apiFetch } from "./client";

export async function fetchAccountDataExport(): Promise<Record<string, unknown>> {
  const response = await apiFetch<{ data: Record<string, unknown> }>("/privacy/export");
  return response.data;
}
