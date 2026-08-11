from dataclasses import dataclass
from collections.abc import Sequence

from ..data import Concept, Place
from ..models import ScoreBreakdown, SolarResult, Status, WeatherResult


@dataclass(frozen=True)
class Evaluation:
    status: Status
    summary: str
    scores: ScoreBreakdown
    reasons: list[str]


def select_best_index(evaluations: Sequence[Evaluation]) -> int:
    """가능 여부를 먼저 보고, 같은 상태에서는 점수와 빠른 시각 순으로 고릅니다."""
    if not evaluations:
        raise ValueError("비교할 촬영 조건이 없습니다.")
    status_priority: dict[Status, int] = {"가능": 2, "보통": 1, "비추천": 0}
    return max(
        range(len(evaluations)),
        key=lambda index: (
            status_priority[evaluations[index].status],
            evaluations[index].scores.total,
            -index,
        ),
    )


def _clamp(value: float) -> int:
    return round(max(0.0, min(100.0, value)))


def _range_score(value: float, minimum: float, maximum: float, falloff: float) -> int:
    if minimum <= value <= maximum:
        return 100
    distance = minimum - value if value < minimum else value - maximum
    return _clamp(100 - distance * falloff)


def _angle_difference(first: float, second: float) -> float:
    return abs((first - second + 180) % 360 - 180)


def recommend_shooting_azimuth(concept: Concept, solar: SolarResult) -> float:
    """콘셉트별 광원 관계가 맞도록 카메라가 바라볼 방향을 계산합니다."""
    return round((solar.azimuth - concept.target_sun_offset) % 360, 1)


def evaluate(
    place: Place, concept: Concept, weather: WeatherResult, solar: SolarResult
) -> Evaluation:
    is_indoor = place.place_type == "indoor"
    if weather.precipitation_mm <= concept.max_precipitation_mm:
        rain_score = 100
    else:
        excess = weather.precipitation_mm - concept.max_precipitation_mm
        rain_score = _clamp(75 - excess * 55)

    comfortable_wind = concept.max_wind_mps * 0.65
    wind_score = (
        100
        if weather.wind_speed_mps <= comfortable_wind
        else _clamp(
            100
            - (weather.wind_speed_mps - comfortable_wind)
            / max(concept.max_wind_mps * 0.85, 0.1)
            * 100
        )
    )
    sky_score = 100 if weather.sky in concept.preferred_skies else 42
    weather_score = _clamp(rain_score * 0.45 + wind_score * 0.25 + sky_score * 0.30)

    if is_indoor:
        # 실내에서는 비·바람·하늘보다 창가나 인공조명 배치가 중요합니다.
        rain_score = max(rain_score, 90)
        wind_score = max(wind_score, 90)
        sky_score = max(sky_score, 75)
        weather_score = _clamp(rain_score * 0.45 + wind_score * 0.25 + sky_score * 0.30)

    elevation_score = _range_score(
        solar.elevation,
        concept.min_solar_elevation,
        concept.max_solar_elevation,
        falloff=6.5,
    )
    if is_indoor:
        elevation_score = max(elevation_score, 72)
        direction_score = 100
        light_score = _clamp(elevation_score * 0.65 + 35)
    elif place.id == "custom":
        # 검색 장소는 서비스가 최적 방향을 안내하므로 방향을 적합도에 중복 가산하지 않습니다.
        direction_score = 100
        light_score = elevation_score
    else:
        target_sun_azimuth = (
            place.shooting_azimuth + concept.target_sun_offset
        ) % 360
        direction_difference = _angle_difference(solar.azimuth, target_sun_azimuth)
        direction_score = _clamp(100 - max(0, direction_difference - 18) * 0.95)
        light_score = _clamp(elevation_score * 0.62 + direction_score * 0.38)

    place_score = (
        85
        if is_indoor
        else 100 if place.place_type in concept.suitable_place_types else 55
    )
    total = _clamp(weather_score * 0.50 + light_score * 0.35 + place_score * 0.15)

    # 해가 완전히 진 뒤의 야외 촬영이나 강한 비는 가중 평균만으로 통과시키지 않습니다.
    # 실내는 자연광이 약하거나 비가 와도 촬영 자체가 불가능한 조건은 아닙니다.
    forced_rejection = (not is_indoor and solar.elevation < -6) or (
        not is_indoor and weather.precipitation_mm >= 5.0
    )
    status: Status
    if forced_rejection or total < 50:
        status = "비추천"
    elif total < 75:
        status = "보통"
    else:
        status = "가능"

    reasons: list[str] = []
    if is_indoor:
        reasons.append("실내 촬영이라 비와 바람의 영향은 낮게 반영했습니다.")
    elif weather.precipitation_mm > concept.max_precipitation_mm:
        reasons.append(
            f"예상 강수량 {weather.precipitation_mm:.1f}mm가 콘셉트 허용치보다 높습니다."
        )
    else:
        reasons.append("강수 조건은 선택한 분위기에 적합합니다.")

    if is_indoor:
        reasons.append("창가 또는 밝은 조명 가까이에서 촬영하면 안정적인 빛을 확보할 수 있습니다.")
    elif wind_score >= 75:
        reasons.append(
            f"풍속 {weather.wind_speed_mps:.1f}m/s로 인물과 카메라 움직임이 안정적입니다."
        )
    elif wind_score >= 40:
        reasons.append(
            f"풍속 {weather.wind_speed_mps:.1f}m/s라 머리카락과 소품 흔들림에 주의해야 합니다."
        )
    else:
        reasons.append("바람이 강해 삼각대 없이 안정적인 촬영이 어렵습니다.")

    if is_indoor:
        reasons.append("태양 방향 대신 창문과 주 조명을 기준으로 촬영 위치를 안내합니다.")
    elif place.id == "custom":
        reasons.append("현재 빛과 선택한 분위기에 맞춰 촬영자가 설 위치를 안내했습니다.")
    elif elevation_score >= 80 and direction_score >= 65:
        reasons.append("태양의 높이와 방향이 장소의 권장 구도에 잘 맞습니다.")
    elif solar.elevation < -6 and not is_indoor:
        reasons.append("도착 시각에는 해가 완전히 져 자연광 촬영이 어렵습니다.")
    elif elevation_score < 55:
        reasons.append(
            f"태양 고도 {solar.elevation:.1f}°가 콘셉트의 권장 범위와 차이가 있습니다."
        )
    else:
        reasons.append("빛의 높이는 괜찮지만 촬영 방향을 조금 조정하는 편이 좋습니다.")

    if place_score < 100:
        reasons.append("선택한 장소 유형은 이 콘셉트의 대표 추천 장소는 아닙니다.")

    summary = {
        "가능": "도착 예상 시각에 바로 촬영해도 좋은 조건입니다.",
        "보통": "촬영은 가능하지만 구도나 장비를 조금 조정해야 합니다.",
        "비추천": "현재 계획보다 다른 시간대나 콘셉트를 권장합니다.",
    }[status]

    return Evaluation(
        status=status,
        summary=summary,
        scores=ScoreBreakdown(
            rain=rain_score,
            wind=wind_score,
            sky=sky_score,
            weather=weather_score,
            light_elevation=elevation_score,
            light_direction=direction_score,
            light=light_score,
            place=place_score,
            total=total,
        ),
        reasons=reasons,
    )
