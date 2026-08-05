import re
from datetime import datetime, timedelta
from math import cos, floor, pi, sin, sqrt, tan
from typing import Any
from urllib.parse import unquote
from zoneinfo import ZoneInfo

import httpx

from ..config import Settings
from ..models import SkyState, WeatherResult


KST = ZoneInfo("Asia/Seoul")
KMA_ULTRA_SHORT_FORECAST_URL = (
    "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst"
)


class WeatherProviderError(RuntimeError):
    pass


def latitude_longitude_to_grid(latitude: float, longitude: float) -> tuple[int, int]:
    """기상청 Lambert Conformal Conic 격자 변환 공식(nx=149, ny=253)."""
    re = 6371.00877 / 5.0
    slat1 = 30.0 * pi / 180.0
    slat2 = 60.0 * pi / 180.0
    olon = 126.0 * pi / 180.0
    olat = 38.0 * pi / 180.0
    xo = 43.0
    yo = 136.0

    sn = tan(pi * 0.25 + slat2 * 0.5) / tan(pi * 0.25 + slat1 * 0.5)
    sn = log_safe(cos(slat1) / cos(slat2)) / log_safe(sn)
    sf = tan(pi * 0.25 + slat1 * 0.5)
    sf = (sf**sn) * cos(slat1) / sn
    ro = tan(pi * 0.25 + olat * 0.5)
    ro = re * sf / (ro**sn)

    ra = tan(pi * 0.25 + latitude * pi / 180.0 * 0.5)
    ra = re * sf / (ra**sn)
    theta = longitude * pi / 180.0 - olon
    if theta > pi:
        theta -= 2.0 * pi
    if theta < -pi:
        theta += 2.0 * pi
    theta *= sn

    nx = floor(ra * sin(theta) + xo + 0.5)
    ny = floor(ro - ra * cos(theta) + yo + 0.5)
    return nx, ny


def log_safe(value: float) -> float:
    from math import log

    return log(value)


def latest_ultra_short_base(now: datetime) -> datetime:
    """매시 30분 발표, API 반영 여유를 고려해 45분 이후 현재 시각 자료 사용."""
    local_now = now.astimezone(KST)
    base = local_now.replace(minute=30, second=0, microsecond=0)
    if local_now.minute < 45:
        base -= timedelta(hours=1)
    return base


def _parse_precipitation(value: Any) -> float:
    text = str(value).strip()
    if not text or "없음" in text:
        return 0.0
    match = re.search(r"\d+(?:\.\d+)?", text)
    return float(match.group()) if match else 0.0


def _sky_state(value: Any) -> SkyState:
    code = str(value).strip()
    return {"1": "맑음", "3": "구름 많음", "4": "흐림"}.get(code, "흐림")  # type: ignore[return-value]


def _select_forecast(
    items: list[dict[str, Any]], arrival_time: datetime
) -> WeatherResult:
    grouped: dict[datetime, dict[str, Any]] = {}
    for item in items:
        try:
            forecast_time = datetime.strptime(
                f"{item['fcstDate']}{str(item['fcstTime']).zfill(4)}", "%Y%m%d%H%M"
            ).replace(tzinfo=KST)
        except (KeyError, TypeError, ValueError):
            continue
        grouped.setdefault(forecast_time, {})[str(item.get("category"))] = item.get(
            "fcstValue"
        )

    complete = [
        (forecast_time, values)
        for forecast_time, values in grouped.items()
        if {"RN1", "WSD", "SKY"}.issubset(values)
    ]
    if not complete:
        raise WeatherProviderError("기상청 응답에 RN1·WSD·SKY 예보가 없습니다.")

    arrival = arrival_time.astimezone(KST)
    future = [entry for entry in complete if entry[0] >= arrival]
    target_time, values = min(
        future or complete,
        key=lambda entry: abs((entry[0] - arrival).total_seconds()),
    )
    return WeatherResult(
        precipitation_mm=round(_parse_precipitation(values["RN1"]), 1),
        wind_speed_mps=round(float(values["WSD"]), 1),
        sky=_sky_state(values["SKY"]),
        forecast_time=target_time,
    )


async def fetch_kma_weather(
    latitude: float,
    longitude: float,
    arrival_time: datetime,
    settings: Settings,
) -> WeatherResult:
    if not settings.kma_service_key:
        raise WeatherProviderError("KMA_SERVICE_KEY가 설정되지 않았습니다.")

    nx, ny = latitude_longitude_to_grid(latitude, longitude)
    base = latest_ultra_short_base(datetime.now(KST))
    params = {
        "serviceKey": unquote(settings.kma_service_key),
        "pageNo": 1,
        "numOfRows": 1000,
        "dataType": "JSON",
        "base_date": base.strftime("%Y%m%d"),
        "base_time": base.strftime("%H%M"),
        "nx": nx,
        "ny": ny,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(KMA_ULTRA_SHORT_FORECAST_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        header = payload["response"]["header"]
        if header.get("resultCode") != "00":
            raise WeatherProviderError(
                f"기상청 API 오류: {header.get('resultMsg', '알 수 없는 오류')}"
            )
        items = payload["response"]["body"]["items"]["item"]
        return _select_forecast(items, arrival_time)
    except WeatherProviderError:
        raise
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise WeatherProviderError(f"기상청 예보를 읽지 못했습니다: {exc}") from exc


def mock_weather(
    latitude: float, longitude: float, arrival_time: datetime
) -> WeatherResult:
    """장소와 시각에 따라 같은 입력은 같은 결과를 내는 데모용 데이터."""
    local_time = arrival_time.astimezone(KST)
    seed = abs(sin(latitude * 3.17 + longitude * 1.91 + local_time.toordinal()))
    hour_wave = (sin((local_time.hour - 7) / 24 * 2 * pi) + 1) / 2

    if seed > 0.82:
        rain = 1.0
        sky: SkyState = "흐림"
    elif seed > 0.58:
        rain = 0.0
        sky = "구름 많음"
    else:
        rain = 0.0
        sky = "맑음"

    wind = round(1.8 + seed * 3.6 + hour_wave * 0.9, 1)
    forecast_time = local_time.replace(minute=0, second=0, microsecond=0)
    if local_time.minute:
        forecast_time += timedelta(hours=1)
    return WeatherResult(
        precipitation_mm=rain,
        wind_speed_mps=wind,
        sky=sky,
        forecast_time=forecast_time,
    )


async def get_weather(
    latitude: float,
    longitude: float,
    arrival_time: datetime,
    settings: Settings,
) -> tuple[WeatherResult, str, str | None]:
    if not settings.use_real_weather:
        return mock_weather(latitude, longitude, arrival_time), "mock", None

    try:
        weather = await fetch_kma_weather(
            latitude, longitude, arrival_time, settings
        )
        return weather, "kma-ultra-short", None
    except WeatherProviderError as exc:
        if settings.app_mode == "real":
            raise
        warning = f"실제 예보 조회에 실패해 mock 데이터로 전환했습니다. ({exc})"
        return mock_weather(latitude, longitude, arrival_time), "mock-fallback", warning

