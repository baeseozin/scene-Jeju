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
    """도착 직후가 이미 좋으면 바로 촬영하고, 아니면 실용적인 추천 시각을 고릅니다."""
    if not evaluations:
        raise ValueError("비교할 촬영 조건이 없습니다.")
    # 사용자가 고른 출발 시각의 도착 조건이 이미 '좋음'이면 몇 점을 더 얻으려고
    # 여러 시간을 기다리게 하지 않습니다. 뒤 시간대의 점수는 비교 카드에 유지합니다.
    if evaluations[0].status == "가능":
        return 0
    status_priority: dict[Status, int] = {"가능": 2, "보통": 1, "비추천": 0}
    highest_status = max(status_priority[evaluation.status] for evaluation in evaluations)
    same_status = [
        index
        for index, evaluation in enumerate(evaluations)
        if status_priority[evaluation.status] == highest_status
    ]
    highest_score = max(evaluations[index].scores.total for index in same_status)
    practical_score_floor = highest_score - 5
    return min(
        index
        for index in same_status
        if evaluations[index].scores.total >= practical_score_floor
    )


def _clamp(value: float) -> int:
    return round(max(0.0, min(100.0, value)))


def _status_for_total(total: int, forced_rejection: bool = False) -> Status:
    """화면 판정 경계를 한곳에서 관리합니다."""
    if forced_rejection or total < 50:
        return "비추천"
    if total < 70:
        return "보통"
    return "가능"


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
        "natural": {"beach": 95, "forest": 100, "urban": 90, "indoor": 78},
        "film": {"beach": 85, "forest": 100, "urban": 95, "indoor": 90},
        "sunset": {"beach": 100, "forest": 75, "urban": 95, "indoor": 55},
        "cozy": {"beach": 82, "forest": 95, "urban": 88, "indoor": 100},
        "sparkling": {"beach": 100, "forest": 65, "urban": 90, "indoor": 55},
    }
    return scores.get(concept_id, {}).get(place_type, 70)


def recommend_shooting_azimuth(concept: Concept, solar: SolarResult) -> float:
    """콘셉트별 광원 관계가 맞도록 카메라가 바라볼 방향을 계산합니다."""
    return round((solar.azimuth - concept.target_sun_offset) % 360, 1)


def _is_intentional_light_effect(concept: Concept, solar: SolarResult) -> bool:
    if concept.id == "sunset":
        return solar.lighting_issue == "수면 반사와 역광"
    if concept.id == "sparkling":
        return solar.lighting_issue in {
            "수면 반사와 역광",
            "유리·노면 반사",
            "유리·젖은 노면 반사",
            "강한 직사광",
        }
    if concept.id == "film":
        return solar.lighting_issue == "자연광 부족"
    return False


def evaluate(
    place: Place, concept: Concept, weather: WeatherResult, solar: SolarResult
) -> Evaluation:
    is_indoor = place.place_type == "indoor"
    is_mood_night = concept.id == "film" and not is_indoor and solar.elevation < 0
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
    irradiance_score = (
        _range_score(
            solar.ghi_wm2,
            concept.min_ghi_wm2,
            concept.max_ghi_wm2,
            falloff=0.16,
        )
        if solar.ghi_wm2 > 0
        else elevation_score
    )
    if is_indoor:
        elevation_score = max(elevation_score, 72)
        direction_score = 100
        light_score = _clamp(elevation_score * 0.35 + irradiance_score * 0.30 + 35)
    elif place.id == "custom":
        # 현장 구조를 모르는 검색 장소에 방향 만점을 주지 않고 중립값을 사용합니다.
        direction_score = 75
        light_score = _clamp(
            elevation_score * 0.45 + irradiance_score * 0.40 + direction_score * 0.15
        )
    else:
        target_sun_azimuth = (
            place.shooting_azimuth + concept.target_sun_offset
        ) % 360
        direction_difference = _angle_difference(solar.azimuth, target_sun_azimuth)
        direction_score = _clamp(100 - max(0, direction_difference - 18) * 0.95)
        light_score = _clamp(
            elevation_score * 0.40 + irradiance_score * 0.32 + direction_score * 0.28
        )

    if is_mood_night:
        # 무드있는 컨셉은 푸른 저녁과 어두운 수평선 자체가 결과물의 일부입니다.
        # 얼굴을 밝게 담는 일반 자연광 기준 대신 실루엣·야간 모드 촬영 가능성을 평가합니다.
        if solar.elevation >= -12:
            elevation_score = irradiance_score = 94
            light_score = 90
        elif solar.elevation >= -24:
            elevation_score = irradiance_score = 84
            light_score = 82
        else:
            elevation_score = irradiance_score = 74
            light_score = 76
        direction_score = 80

    intentional_light_effect = _is_intentional_light_effect(concept, solar)
    if not intentional_light_effect:
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
    severe_rain_threshold = max(2.0, concept.max_precipitation_mm + 1.5)
    elevation_gap = (
        concept.min_solar_elevation - solar.elevation
        if solar.elevation < concept.min_solar_elevation
        else solar.elevation - concept.max_solar_elevation
        if solar.elevation > concept.max_solar_elevation
        else 0.0
    )
    if not is_indoor:
        if solar.elevation < -6 and not is_mood_night:
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
        if elevation_gap > 20.0 and not is_mood_night:
            forced_rejection = True
            rejection_score_cap = min(
                rejection_score_cap,
                max(15, round(46 - (elevation_gap - 20.0) * 0.9)),
            )
        if weather.precipitation_mm > concept.max_precipitation_mm:
            rain_excess = weather.precipitation_mm - concept.max_precipitation_mm
            score_cap = min(score_cap, max(55, round(69 - rain_excess * 7.0)))
        if weather.wind_speed_mps > concept.max_wind_mps:
            wind_excess = weather.wind_speed_mps - concept.max_wind_mps
            score_cap = min(score_cap, max(55, round(69 - wind_excess * 3.0)))
        if elevation_gap > 8.0 and not is_mood_night:
            score_cap = min(
                score_cap, max(50, round(69 - (elevation_gap - 8.0) * 0.8))
            )
        if solar.lighting_risk == "높음" and not intentional_light_effect:
            risk_excess = max(0, solar.lighting_risk_score - 60)
            score_cap = min(
                score_cap, max(55, round(69 - risk_excess * 0.45))
            )
    total = min(total, score_cap, rejection_score_cap if forced_rejection else 100)
    status = _status_for_total(total, forced_rejection)

    reasons: list[str] = []
    if is_indoor:
        reasons.append("실내 촬영이라 비와 바람의 영향은 낮게 반영했습니다.")
    elif weather.precipitation_mm > concept.max_precipitation_mm:
        reasons.append("우산이나 처마를 활용하면 비가 있어도 선택한 분위기를 살릴 수 있습니다.")
    else:
        reasons.append("강수 조건은 선택한 분위기에 적합합니다.")

    if is_indoor:
        reasons.append("창가 또는 밝은 조명 가까이에서 촬영하면 안정적인 빛을 확보할 수 있습니다.")
    elif wind_score >= 75:
        reasons.append("바람이 약해 인물과 카메라 움직임이 안정적입니다.")
    elif wind_score >= 40:
        reasons.append("바람의 움직임을 살리되 머리카락과 소품을 한쪽으로 정리하면 자연스럽게 담을 수 있습니다.")
    else:
        reasons.append("벽 안쪽에서 촬영하거나 휴대폰을 고정하면 바람이 있어도 안정적으로 담을 수 있습니다.")

    if is_indoor:
        reasons.append("태양 방향 대신 창문과 주 조명을 기준으로 촬영 위치를 안내합니다.")
    elif is_mood_night:
        reasons.append("어두운 하늘과 수평선이 차분한 영화 장면 같은 분위기를 만들어 줍니다.")
    elif place.id == "custom":
        reasons.append("현재 빛과 선택한 분위기에 맞춰 촬영자가 설 위치를 안내했습니다.")
    elif elevation_score >= 80 and direction_score >= 65:
        reasons.append("햇빛이 들어오는 때와 방향이 장소의 권장 구도에 잘 맞습니다.")
    elif solar.elevation < -6 and not is_indoor:
        reasons.append("해가 완전히 진 시간이라 휴대폰을 고정하거나 추천 시간대의 자연광을 이용하면 더 선명하게 담을 수 있습니다.")
    elif elevation_score < 55:
        reasons.append("지금 들어오는 빛이 선택한 분위기와 잘 맞지 않습니다.")
    else:
        reasons.append("빛은 괜찮지만 촬영 위치를 조금 옮기는 편이 좋습니다.")

    if solar.lighting_risk != "낮음":
        if is_mood_night and solar.lighting_issue == "자연광 부족":
            reasons.append(
                "휴대폰 야간 모드를 켜고 난간이나 삼각대에 고정하면 어두운 바다색과 인물 윤곽을 선명하게 담을 수 있습니다."
            )
        elif solar.lighting_issue == "수면 반사와 역광" and concept.id in {"sunset", "sparkling"}:
            reasons.append(
                "수면 반사와 역광이 선택한 콘셉트의 반짝임과 윤곽을 만들어 줍니다. 화면에서 얼굴을 한 번 눌러 밝기를 맞춰보세요."
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
                "건물 그늘 안쪽으로 한두 걸음 이동하면 얼굴과 배경의 밝기를 고르게 담을 수 있습니다."
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

    if not is_indoor and not is_mood_night and elevation_gap > 20:
        reasons.append("추천 시간대를 확인하면 선택한 분위기에 어울리는 빛을 더 잘 만날 수 있습니다.")
    elif not is_indoor and not is_mood_night and elevation_gap > 8:
        reasons.append("지금도 촬영할 수 있고, 안내된 위치에서 빛 방향을 맞추면 분위기가 더 좋아집니다.")
    if not is_indoor and weather.precipitation_mm >= severe_rain_threshold:
        reasons.append("비가 잦아드는 추천 시간대를 이용하면 렌즈와 옷을 더 편하게 관리할 수 있습니다.")
    if not is_indoor and weather.wind_speed_mps >= concept.max_wind_mps + 3:
        reasons.append("바람이 잦아드는 시간이나 벽 안쪽을 이용하면 화면을 더 안정적으로 담을 수 있습니다.")
    elif not is_indoor and weather.wind_speed_mps > concept.max_wind_mps:
        reasons.append("벽이나 건물 안쪽으로 옮기면 머리카락과 화면 흔들림을 줄일 수 있습니다.")
    if (
        not is_indoor
        and solar.lighting_risk == "높음"
        and not intentional_light_effect
    ):
        reasons.append("안내된 위치로 옮기면 얼굴과 배경의 밝기를 더 편하게 맞출 수 있습니다.")

    summary = {
        "가능": "도착 예상 시각에 선택한 분위기를 담기 좋은 조건입니다.",
        "보통": "지금 촬영해도 괜찮아요. 안내된 팁을 따르면 분위기가 더 잘 살아납니다.",
        "비추천": "추천 시간대를 확인하면 원하는 분위기를 더 편하게 담을 수 있어요.",
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
