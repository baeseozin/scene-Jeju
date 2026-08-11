from dataclasses import dataclass
from math import asin, ceil, cos, radians, sin, sqrt

import httpx

from ..config import Settings
from ..models import TransportMode


EARTH_RADIUS_KM = 6371.0088
KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions"


@dataclass(frozen=True)
class TravelResult:
    distance_km: float
    travel_minutes: int
    source: str
    warning: str | None = None


def haversine_km(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
) -> float:
    lat1, lon1, lat2, lon2 = map(
        radians,
        (
            origin_latitude,
            origin_longitude,
            destination_latitude,
            destination_longitude,
        ),
    )
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    )
    return EARTH_RADIUS_KM * 2 * asin(sqrt(a))


def estimate_travel(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
) -> tuple[float, int]:
    """직선거리에 제주 도로 우회율과 평균 주행속도를 적용한 MVP 추정값."""
    direct_distance = haversine_km(
        origin_latitude,
        origin_longitude,
        destination_latitude,
        destination_longitude,
    )
    road_distance = direct_distance * 1.23
    average_speed_kmh = 38.0 if road_distance < 35 else 46.0
    travel_minutes = round(road_distance / average_speed_kmh * 60 + 7)
    return round(road_distance, 1), max(5, travel_minutes)


def estimate_travel_by_mode(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
    transport_mode: TransportMode,
) -> tuple[float, int]:
    direct_distance = haversine_km(
        origin_latitude,
        origin_longitude,
        destination_latitude,
        destination_longitude,
    )
    if transport_mode == "walk":
        walking_distance = direct_distance * 1.16
        return round(walking_distance, 1), max(1, ceil(walking_distance / 4.5 * 60))
    if transport_mode == "transit":
        transit_distance = direct_distance * 1.28
        # 정류장 이동·평균 배차 대기 15분을 포함한 제주 버스 MVP 추정값입니다.
        return round(transit_distance, 1), max(8, ceil(transit_distance / 27 * 60 + 15))
    return estimate_travel(
        origin_latitude,
        origin_longitude,
        destination_latitude,
        destination_longitude,
    )


async def get_travel(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
    settings: Settings,
    transport_mode: TransportMode = "car",
) -> TravelResult:
    """카카오모빌리티 경로를 우선 사용하고 권한·네트워크 오류 시 추정값으로 전환합니다."""
    estimated_distance, estimated_minutes = estimate_travel_by_mode(
        origin_latitude,
        origin_longitude,
        destination_latitude,
        destination_longitude,
        transport_mode,
    )
    if transport_mode != "car":
        label = "transit-estimated" if transport_mode == "transit" else "walk-estimated"
        return TravelResult(estimated_distance, estimated_minutes, label)
    if not settings.kakao_rest_api_key:
        return TravelResult(estimated_distance, estimated_minutes, "estimated")

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                KAKAO_DIRECTIONS_URL,
                params={
                    "origin": f"{origin_longitude},{origin_latitude}",
                    "destination": f"{destination_longitude},{destination_latitude}",
                    "priority": "RECOMMEND",
                    "summary": "true",
                },
                headers={
                    "Authorization": f"KakaoAK {settings.kakao_rest_api_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            routes = response.json().get("routes", [])
        if not routes or routes[0].get("result_code") != 0:
            message = routes[0].get("result_msg", "경로 없음") if routes else "경로 없음"
            raise ValueError(message)
        summary = routes[0]["summary"]
        distance_km = round(float(summary["distance"]) / 1000, 1)
        travel_minutes = max(1, ceil(float(summary["duration"]) / 60))
        return TravelResult(distance_km, travel_minutes, "kakao-mobility")
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        return TravelResult(
            estimated_distance,
            estimated_minutes,
            "estimated-fallback",
            f"실제 자동차 경로를 조회하지 못해 거리 기반 예상 시간을 사용했습니다. ({exc})",
        )
