from datetime import datetime
from zoneinfo import ZoneInfo

from app.data import CONCEPTS, PLACES
from app.models import SolarResult, WeatherResult
from app.services.scoring import evaluate, recommend_shooting_azimuth, select_best_index
from app.services.place_search import infer_place_type
from app.services.travel import estimate_travel, estimate_travel_by_mode
from app.services.weather import latitude_longitude_to_grid, latest_short_base


KST = ZoneInfo("Asia/Seoul")


def test_kma_grid_conversion_matches_seoul_reference() -> None:
    assert latitude_longitude_to_grid(37.5665, 126.9780) == (60, 127)


def test_travel_estimate_is_positive_and_repeatable() -> None:
    first = estimate_travel(33.5104, 126.4914, 33.3941, 126.2397)
    second = estimate_travel(33.5104, 126.4914, 33.3941, 126.2397)
    assert first == second
    assert first[0] > 20
    assert first[1] > 20


def test_good_refreshing_conditions_are_available() -> None:
    weather = WeatherResult(
        precipitation_mm=0.0,
        wind_speed_mps=2.0,
        sky="맑음",
        forecast_time=datetime(2026, 8, 5, 15, tzinfo=KST),
    )
    # 협재 촬영 방향은 서쪽, 청량 콘셉트의 정면광 목표 태양은 동쪽입니다.
    solar = SolarResult(elevation=42.0, azimuth=95.0)
    result = evaluate(
        PLACES["hyeopjae"], CONCEPTS["refreshing"], weather, solar
    )
    assert result.status == "가능"
    assert result.scores.total >= 75


def test_night_conditions_are_rejected() -> None:
    weather = WeatherResult(
        precipitation_mm=0.0,
        wind_speed_mps=1.0,
        sky="맑음",
        forecast_time=datetime(2026, 8, 5, 23, tzinfo=KST),
    )
    solar = SolarResult(elevation=-18.0, azimuth=310.0)
    result = evaluate(PLACES["dodu"], CONCEPTS["sunset"], weather, solar)
    assert result.status == "비추천"
    assert any("해가 완전히" in reason for reason in result.reasons)


def test_place_type_is_inferred_from_kakao_category() -> None:
    assert infer_place_type("함덕해수욕장", "여행 > 관광,명소 > 해수욕장") == "beach"
    assert infer_place_type("사려니숲길", "여행 > 관광,명소 > 숲") == "forest"
    assert infer_place_type("제주도립미술관", "문화,예술 > 미술관") == "indoor"


def test_shooting_direction_follows_concept_light_relationship() -> None:
    solar = SolarResult(elevation=12.0, azimuth=250.0)
    assert recommend_shooting_azimuth(CONCEPTS["refreshing"], solar) == 70.0
    assert recommend_shooting_azimuth(CONCEPTS["film"], solar) == 160.0
    assert recommend_shooting_azimuth(CONCEPTS["sunset"], solar) == 250.0


def test_transport_modes_have_different_estimates() -> None:
    car = estimate_travel_by_mode(33.5104, 126.4914, 33.3941, 126.2397, "car")
    transit = estimate_travel_by_mode(33.5104, 126.4914, 33.3941, 126.2397, "transit")
    walk = estimate_travel_by_mode(33.5104, 126.4914, 33.3941, 126.2397, "walk")
    assert car[1] != transit[1]
    assert walk[1] > transit[1] > car[1]


def test_indoor_is_not_forced_to_rejection_by_rain_or_night() -> None:
    from dataclasses import replace

    indoor = replace(PLACES["dodu"], id="custom", place_type="indoor")
    weather = WeatherResult(
        precipitation_mm=8.0,
        wind_speed_mps=12.0,
        sky="흐림",
        forecast_time=datetime(2026, 8, 5, 23, tzinfo=KST),
    )
    solar = SolarResult(elevation=-18.0, azimuth=310.0)
    result = evaluate(indoor, CONCEPTS["film"], weather, solar)
    assert result.status != "비추천"
    assert any("실내 촬영" in reason for reason in result.reasons)


def test_short_forecast_base_uses_previous_issue_before_two_fifteen() -> None:
    now = datetime(2026, 8, 5, 2, 10, tzinfo=KST)
    assert latest_short_base(now) == datetime(2026, 8, 4, 23, 0, tzinfo=KST)


def test_best_time_prefers_available_status_before_raw_score() -> None:
    from types import SimpleNamespace

    evaluations = [
        SimpleNamespace(status="비추천", scores=SimpleNamespace(total=92)),
        SimpleNamespace(status="가능", scores=SimpleNamespace(total=76)),
        SimpleNamespace(status="가능", scores=SimpleNamespace(total=76)),
    ]
    assert select_best_index(evaluations) == 1
