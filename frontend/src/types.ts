export type Status = "가능" | "보통" | "비추천";

export interface Place {
  id: string;
  name: string;
  description: string;
  place_type: string;
  latitude: number;
  longitude: number;
  shooting_azimuth: number;
  direction_label: string;
  accent: string;
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  accent: string;
}

export interface Catalog {
  places: Place[];
  concepts: Concept[];
  mode: string;
}

export interface Analysis {
  status: Status;
  summary: string;
  mode: string;
  data_source: string;
  warning: string | null;
  place: Place;
  concept: Concept;
  distance_km: number;
  travel_minutes: number;
  departure_time: string;
  arrival_time: string;
  weather: {
    precipitation_mm: number;
    wind_speed_mps: number;
    sky: string;
    forecast_time: string;
  };
  solar: {
    elevation: number;
    azimuth: number;
  };
  scores: {
    rain: number;
    wind: number;
    sky: number;
    weather: number;
    light_elevation: number;
    light_direction: number;
    light: number;
    place: number;
    total: number;
  };
  reasons: string[];
  guide: string[];
}

