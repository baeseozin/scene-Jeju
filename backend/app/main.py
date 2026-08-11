from dataclasses import replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .data import (
    CONCEPTS,
    PLACES,
    Place,
    direction_label,
    guide_for,
    shooting_direction_guide,
)
from .models import (
    AnalyzeRequest,
    AnalyzeResponse,
    CatalogResponse,
    PlaceSearchResult,
    PlaceSearchResponse,
    TimeSlotResult,
)
from .services.place_search import (
    PlaceSearchError,
    reverse_jeju_place,
    search_jeju_places,
)
from .services.scoring import evaluate, recommend_shooting_azimuth, select_best_index
from .services.solar import calculate_solar_position
from .services.travel import get_travel
from .services.weather import WeatherProviderError, get_weather_series


KST = ZoneInfo("Asia/Seoul")
settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="도착 시각의 날씨와 태양 위치를 결합한 제주 촬영 적합도 API",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "mode": settings.app_mode}


@app.get("/api/catalog", response_model=CatalogResponse)
async def catalog() -> CatalogResponse:
    return CatalogResponse(
        places=[place.public() for place in PLACES.values()],
        concepts=[concept.public() for concept in CONCEPTS.values()],
        mode=settings.app_mode,
    )


@app.get("/api/places/search", response_model=PlaceSearchResponse)
async def search_places(
    query: str = Query(min_length=2, max_length=60),
) -> PlaceSearchResponse:
    try:
        results = await search_jeju_places(query, settings)
    except PlaceSearchError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return PlaceSearchResponse(results=results)


@app.get("/api/places/reverse", response_model=PlaceSearchResult)
async def reverse_place(
    latitude: float = Query(ge=33.05, le=33.65),
    longitude: float = Query(ge=125.95, le=127.05),
):
    try:
        return await reverse_jeju_place(latitude, longitude, settings)
    except PlaceSearchError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    if payload.place is not None:
        place = Place(
            id="custom",
            name=payload.place.name.strip(),
            description="사용자가 직접 입력한 촬영 장소",
            place_type=payload.place.place_type,
            latitude=payload.place.latitude,
            longitude=payload.place.longitude,
            shooting_azimuth=0,
            direction_label="분석 후 계산",
            accent="#66d4e8",
        )
    else:
        place = PLACES.get(payload.place_id or "")
        if place is None:
            raise HTTPException(status_code=404, detail="지원하지 않는 촬영 장소입니다.")
    concept = CONCEPTS.get(payload.concept_id)
    if concept is None:
        raise HTTPException(status_code=404, detail="지원하지 않는 촬영 콘셉트입니다.")

    departure_time = payload.departure_time or datetime.now(KST)
    departure_time = departure_time.astimezone(KST)
    travel = await get_travel(
        payload.current_location.latitude,
        payload.current_location.longitude,
        place.latitude,
        place.longitude,
        settings,
        payload.transport_mode,
    )
    arrival_time = departure_time + timedelta(minutes=travel.travel_minutes)
    search_hours = 12 if concept.id == "sunset" else 6
    target_times = [
        arrival_time + timedelta(hours=offset)
        for offset in range(search_hours + 1)
    ]

    try:
        forecasts, weather_warning = await get_weather_series(
            place.latitude, place.longitude, target_times, settings
        )
    except WeatherProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    solar_results = [
        calculate_solar_position(place.latitude, place.longitude, target_time)
        for target_time in target_times
    ]
    evaluations = [
        evaluate(place, concept, weather, solar)
        for (weather, _), solar in zip(forecasts, solar_results, strict=True)
    ]
    best_index = select_best_index(evaluations)
    time_slots = [
        TimeSlotResult(
            time=target_time,
            status=evaluation.status,
            score=evaluation.scores.total,
            weather=weather,
            solar=solar,
            data_source=source,
            is_best=index == best_index,
        )
        for index, (target_time, evaluation, (weather, source), solar) in enumerate(
            zip(target_times, evaluations, forecasts, solar_results, strict=True)
        )
    ]
    weather, data_source = forecasts[best_index]
    solar = solar_results[best_index]
    evaluation = evaluations[best_index]
    if place.id == "custom":
        recommended_azimuth = recommend_shooting_azimuth(concept, solar)
        place = replace(
            place,
            shooting_azimuth=recommended_azimuth,
            direction_label=direction_label(recommended_azimuth),
        )
    warnings = [message for message in (travel.warning, weather_warning) if message]
    warning = " ".join(warnings) or None
    summary = evaluation.summary
    if best_index > 0:
        summary = (
            f"도착 후 {best_index}시간 뒤가 선택한 분위기에 가장 좋은 조건입니다."
        )

    return AnalyzeResponse(
        status=evaluation.status,
        summary=summary,
        mode=settings.app_mode,
        data_source=data_source,
        warning=warning,
        place=place.public(),
        concept=concept.public(),
        distance_km=travel.distance_km,
        travel_minutes=travel.travel_minutes,
        travel_source=travel.source,
        transport_mode=payload.transport_mode,
        departure_time=departure_time,
        arrival_time=arrival_time,
        weather=weather,
        solar=solar,
        shooting_direction_guide=shooting_direction_guide(place, concept),
        capture_mode=payload.capture_mode,
        time_slots=time_slots,
        best_time=target_times[best_index],
        best_offset_minutes=best_index * 60,
        scores=evaluation.scores,
        reasons=evaluation.reasons,
        guide=guide_for(place, concept, payload.capture_mode),
    )
