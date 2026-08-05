from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .data import CONCEPTS, GUIDES, PLACES
from .models import AnalyzeRequest, AnalyzeResponse, CatalogResponse
from .services.scoring import evaluate
from .services.solar import calculate_solar_position
from .services.travel import estimate_travel
from .services.weather import WeatherProviderError, get_weather


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


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    place = PLACES.get(payload.place_id)
    if place is None:
        raise HTTPException(status_code=404, detail="지원하지 않는 촬영 장소입니다.")
    concept = CONCEPTS.get(payload.concept_id)
    if concept is None:
        raise HTTPException(status_code=404, detail="지원하지 않는 촬영 콘셉트입니다.")

    departure_time = payload.departure_time or datetime.now(KST)
    departure_time = departure_time.astimezone(KST)
    distance_km, travel_minutes = estimate_travel(
        payload.current_location.latitude,
        payload.current_location.longitude,
        place.latitude,
        place.longitude,
    )
    arrival_time = departure_time + timedelta(minutes=travel_minutes)

    try:
        weather, data_source, warning = await get_weather(
            place.latitude, place.longitude, arrival_time, settings
        )
    except WeatherProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    solar = calculate_solar_position(
        place.latitude, place.longitude, arrival_time
    )
    evaluation = evaluate(place, concept, weather, solar)

    return AnalyzeResponse(
        status=evaluation.status,
        summary=evaluation.summary,
        mode=settings.app_mode,
        data_source=data_source,
        warning=warning,
        place=place.public(),
        concept=concept.public(),
        distance_km=distance_km,
        travel_minutes=travel_minutes,
        departure_time=departure_time,
        arrival_time=arrival_time,
        weather=weather,
        solar=solar,
        scores=evaluation.scores,
        reasons=evaluation.reasons,
        guide=GUIDES[(place.id, concept.id)],
    )
