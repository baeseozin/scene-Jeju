import type { Analysis, CaptureMode, Catalog, PlaceSearchResult, TransportMode } from "./types";

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

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const response = await request<{ results: PlaceSearchResult[] }>(
    `/api/places/search?query=${encodeURIComponent(query)}`,
  );
  return response.results;
}

export function reversePlace(latitude: number, longitude: number): Promise<PlaceSearchResult> {
  return request<PlaceSearchResult>(
    `/api/places/reverse?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`,
  );
}

export function analyze(params: {
  latitude: number;
  longitude: number;
  placeId?: string;
  place?: {
    name: string;
    latitude: number;
    longitude: number;
    placeType: "beach" | "forest" | "urban" | "indoor";
  };
  conceptId: string;
  captureMode: CaptureMode;
  transportMode: TransportMode;
}): Promise<Analysis> {
  const placePayload = params.placeId
    ? { place_id: params.placeId }
    : params.place
      ? {
          place: {
            name: params.place.name,
            latitude: params.place.latitude,
            longitude: params.place.longitude,
            place_type: params.place.placeType,
          },
        }
      : {};
  return request<Analysis>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({
      current_location: {
        latitude: params.latitude,
        longitude: params.longitude,
      },
      ...placePayload,
      concept_id: params.conceptId,
      capture_mode: params.captureMode,
      transport_mode: params.transportMode,
      departure_time: new Date().toISOString(),
    }),
  });
}
