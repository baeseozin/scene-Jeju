import type { Analysis, Catalog } from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? "서버 요청에 실패했습니다.");
  }
  return response.json() as Promise<T>;
}

export function getCatalog(): Promise<Catalog> {
  return request<Catalog>("/api/catalog");
}

export function analyze(params: {
  latitude: number;
  longitude: number;
  placeId: string;
  conceptId: string;
}): Promise<Analysis> {
  return request<Analysis>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({
      current_location: {
        latitude: params.latitude,
        longitude: params.longitude,
      },
      place_id: params.placeId,
      concept_id: params.conceptId,
      departure_time: new Date().toISOString(),
    }),
  });
}

