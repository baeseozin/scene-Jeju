from datetime import datetime
from zoneinfo import ZoneInfo

from app.data import CONCEPTS, PLACES
from app.models import SolarResult, WeatherResult
from app.services.scoring import evaluate
from app.services.travel import estimate_travel
from app.services.weather import latitude_longitude_to_grid


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

