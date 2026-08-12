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


def _place_type_score(place_type: str, concept_id: str) -> int:
    """콘셉트와 장소의 조합을 이분법 대신 단계적으로 평가합니다."""
    scores = {
        "refreshing": {"beach": 100, "forest": 90, "urban": 95, "indoor": 75},
        "film": {"beach": 85, "forest": 100, "urban": 95, "indoor": 90},
        "sunset": {"beach": 100, "forest": 75, "urban": 95, "indoor": 55},
    }
    return scores.get(concept_id, {}).get(place_type, 70)


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
        # 현장 구조를 모르는 검색 장소에 방향 만점을 주지 않고 중립값을 사용합니다.
        direction_score = 75
        light_score = _clamp(elevation_score * 0.80 + direction_score * 0.20)
    else:
        target_sun_azimuth = (
            place.shooting_azimuth + concept.target_sun_offset
        ) % 360
        direction_difference = _angle_difference(solar.azimuth, target_sun_azimuth)
        direction_score = _clamp(100 - max(0, direction_difference - 18) * 0.95)
        light_score = _clamp(elevation_score * 0.62 + direction_score * 0.38)

    # 노을 실루엣은 강한 명암과 역광을 의도한 콘셉트이므로 별도 감점하지 않습니다.
    if concept.id != "sunset":
        if solar.lighting_risk == "높음":
            light_score = _clamp(light_score * (0.90 if is_indoor else 0.82))
        elif solar.lighting_risk == "보통":
            light_score = _clamp(light_score * 0.94)

    place_score = _place_type_score(place.place_type, concept.id)
    total = _clamp(weather_score * 0.40 + light_score * 0.45 + place_score * 0.15)

    # 치명적인 한 조건이 다른 만점에 가려지지 않도록 판정 상한을 적용합니다.
    score_cap = 100
    rejection_score_cap = 49
    forced_rejection = False
    intentional_sunset_backlight = False
    severe_rain_threshold = max(2.0, concept.max_precipitation_mm + 1.5)
    elevation_gap = (
        concept.min_solar_elevation - solar.elevation
        if solar.elevation < concept.min_solar_elevation
        else solar.elevation - concept.max_solar_elevation
        if solar.elevation > concept.max_solar_elevation
        else 0.0
    )
    if not is_indoor:
        if solar.elevation < -6:
            forced_rejection = True
            night_depth = -6 - solar.elevation
            rejection_score_cap = min(
                rejection_score_cap, max(10, round(47 - night_depth * 1.8))
            )
        if weather.precipitation_mm >= severe_rain_threshold:
            forced_rejection = True
            severe_rain_excess = weather.precipitation_mm - severe_rain_threshold
            rejection_score_cap = min(
                rejection_score_cap,
                max(10, round(46 - severe_rain_excess * 8.0)),
            )
        if weather.wind_speed_mps >= concept.max_wind_mps + 3.0:
            forced_rejection = True
            severe_wind_excess = weather.wind_speed_mps - (
                concept.max_wind_mps + 3.0
            )
            rejection_score_cap = min(
                rejection_score_cap,
                max(15, round(46 - severe_wind_excess * 5.0)),
            )
        if elevation_gap > 20.0:
            forced_rejection = True
            rejection_score_cap = min(
                rejection_score_cap,
                max(15, round(46 - (elevation_gap - 20.0) * 0.9)),
            )
        if weather.precipitation_mm > concept.max_precipitation_mm:
            rain_excess = weather.precipitation_mm - concept.max_precipitation_mm
            score_cap = min(score_cap, max(55, round(74 - rain_excess * 7.0)))
        if weather.wind_speed_mps > concept.max_wind_mps:
            wind_excess = weather.wind_speed_mps - concept.max_wind_mps
            score_cap = min(score_cap, max(55, round(74 - wind_excess * 3.0)))
        if elevation_gap > 8.0:
            score_cap = min(
                score_cap, max(50, round(74 - (elevation_gap - 8.0) * 0.8))
            )
        intentional_sunset_backlight = (
            concept.id == "sunset"
            and solar.lighting_issue == "수면 반사와 역광"
        )
        if solar.lighting_risk == "높음" and not intentional_sunset_backlight:
            risk_excess = max(0, solar.lighting_risk_score - 60)
            score_cap = min(
                score_cap, max(55, round(74 - risk_excess * 0.45))
            )
    total = min(total, score_cap, rejection_score_cap if forced_rejection else 100)
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

    if solar.lighting_risk != "낮음":
        if solar.lighting_issue == "수면 반사와 역광" and concept.id == "sunset":
            reasons.append(
                "수면 반사와 역광이 실루엣을 선명하게 만드는 조건입니다. 얼굴 노출은 따로 조정해야 합니다."
            )
        elif solar.lighting_issue == "수면 반사와 역광":
            reasons.append(
                "수면 반사로 배경이 매우 밝아지면 자동 노출에서 얼굴이 어두워질 수 있습니다."
            )
        elif solar.lighting_issue == "나뭇잎 사이 얼룩 그림자":
            reasons.append(
                "직사광이 나뭇잎 틈을 통과해 얼굴에 밝고 어두운 얼룩을 만들 수 있습니다."
            )
        elif solar.lighting_issue in {"유리·노면 반사", "유리·젖은 노면 반사"}:
            reasons.append(
                f"{solar.lighting_issue}가 렌즈로 들어오면 배경이 날아가거나 인물이 어두워질 수 있습니다."
            )
        elif solar.lighting_issue == "강한 직사광과 건물 그림자":
            reasons.append(
                "강한 햇빛과 건물 그늘의 밝기 차가 커 한 화면의 노출을 맞추기 어렵습니다."
            )
        elif solar.lighting_issue == "창문 역광과 실내외 명암차":
            reasons.append(
                "창밖과 실내의 밝기 차가 커 창문을 등지면 얼굴이 어두워질 수 있습니다."
            )
        elif solar.lighting_issue == "자연광 부족":
            reasons.append("자연광이 약해 흔들림과 노이즈가 생길 가능성이 높습니다.")
        else:
            reasons.append("직사광이 강해 얼굴의 명암과 밝은 배경 노출을 확인해야 합니다.")

    if place_score < 100:
        reasons.append(
            f"이 장소 유형의 콘셉트 적합도는 {place_score}점으로 반영했습니다."
        )

    if not is_indoor and elevation_gap > 20:
        reasons.append("태양 높이가 콘셉트의 핵심 시간대와 크게 달라 비추천 처리했습니다.")
    elif not is_indoor and elevation_gap > 8:
        reasons.append("태양 높이가 권장 범위를 벗어나 결과를 최대 ‘보통’으로 제한했습니다.")
    if not is_indoor and weather.precipitation_mm >= severe_rain_threshold:
        reasons.append("강수량이 콘셉트 허용 범위를 크게 넘어 비추천 처리했습니다.")
    if not is_indoor and weather.wind_speed_mps >= concept.max_wind_mps + 3:
        reasons.append("바람이 콘셉트 허용 범위를 크게 넘어 비추천 처리했습니다.")
    elif not is_indoor and weather.wind_speed_mps > concept.max_wind_mps:
        reasons.append("바람이 권장 범위를 넘어 결과를 최대 ‘보통’으로 제한했습니다.")
    if (
        not is_indoor
        and solar.lighting_risk == "높음"
        and not intentional_sunset_backlight
    ):
        reasons.append("빛 위험이 높아 다른 점수가 좋아도 결과를 최대 ‘보통’으로 제한했습니다.")

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
