from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


Status = Literal["가능", "보통", "비추천"]
SkyState = Literal["맑음", "구름 많음", "흐림"]


class Coordinate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AnalyzeRequest(BaseModel):
    current_location: Coordinate
    place_id: str
    concept_id: str
    departure_time: datetime | None = Field(
        default=None,
        description="생략하면 서버의 현재 시각(Asia/Seoul)을 사용합니다.",
    )

    @field_validator("departure_time")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("departure_time에는 UTC offset이 필요합니다.")
        return value


class PlacePublic(BaseModel):
    id: str
    name: str
    description: str
    place_type: str
    latitude: float
    longitude: float
    shooting_azimuth: float
    direction_label: str
    accent: str


class ConceptPublic(BaseModel):
    id: str
    name: str
    description: str
    accent: str


class CatalogResponse(BaseModel):
    places: list[PlacePublic]
    concepts: list[ConceptPublic]
    mode: str


class WeatherResult(BaseModel):
    precipitation_mm: float
    wind_speed_mps: float
    sky: SkyState
    forecast_time: datetime


class SolarResult(BaseModel):
    elevation: float
    azimuth: float


class ScoreBreakdown(BaseModel):
    rain: int
    wind: int
    sky: int
    weather: int
    light_elevation: int
    light_direction: int
    light: int
    place: int
    total: int


class AnalyzeResponse(BaseModel):
    status: Status
    summary: str
    mode: str
    data_source: str
    warning: str | None = None
    place: PlacePublic
    concept: ConceptPublic
    distance_km: float
    travel_minutes: int
    departure_time: datetime
    arrival_time: datetime
    weather: WeatherResult
    solar: SolarResult
    scores: ScoreBreakdown
    reasons: list[str]
    guide: list[str]

