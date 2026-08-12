from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


Status = Literal["가능", "보통", "비추천"]
SkyState = Literal["맑음", "구름 많음", "흐림"]
CaptureMode = Literal["photo", "video"]
TransportMode = Literal["car", "transit", "walk"]


class Coordinate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CustomPlaceInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    latitude: float = Field(ge=33.05, le=33.65)
    longitude: float = Field(ge=125.95, le=127.05)
    place_type: Literal["beach", "forest", "urban", "indoor"]


class AnalyzeRequest(BaseModel):
    current_location: Coordinate
    place_id: str | None = None
    place: CustomPlaceInput | None = None
    concept_id: str
    capture_mode: CaptureMode = "video"
    transport_mode: TransportMode = "car"
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

    @model_validator(mode="after")
    def require_place(self) -> "AnalyzeRequest":
        if self.place is None and self.place_id is None:
            raise ValueError("place 또는 place_id 중 하나가 필요합니다.")
        if self.place is not None and self.place_id is not None:
            raise ValueError("place와 place_id는 동시에 보낼 수 없습니다.")
        return self


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


class PlaceSearchResult(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    category: str
    place_type: Literal["beach", "forest", "urban", "indoor"]


class PlaceSearchResponse(BaseModel):
    results: list[PlaceSearchResult]


class WeatherResult(BaseModel):
    precipitation_mm: float
    wind_speed_mps: float
    sky: SkyState
    forecast_time: datetime


class SolarResult(BaseModel):
    elevation: float
    azimuth: float
    ghi_wm2: int = 0
    dni_wm2: int = 0
    dhi_wm2: int = 0
    lighting_risk: Literal["낮음", "보통", "높음"] = "낮음"
    lighting_risk_score: int = 0
    lighting_issue: str = "빛 조건 안정"


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


class TimeSlotResult(BaseModel):
    time: datetime
    status: Status
    score: int
    weather: WeatherResult
    solar: SolarResult
    data_source: str
    is_best: bool = False


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
    travel_source: str
    transport_mode: TransportMode
    departure_time: datetime
    arrival_time: datetime
    weather: WeatherResult
    solar: SolarResult
    shooting_direction_guide: str
    capture_mode: CaptureMode
    time_slots: list[TimeSlotResult]
    best_time: datetime
    best_offset_minutes: int
    scores: ScoreBreakdown
    reasons: list[str]
    guide: list[str]
