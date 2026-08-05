from math import asin, cos, radians, sin, sqrt


EARTH_RADIUS_KM = 6371.0088


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

