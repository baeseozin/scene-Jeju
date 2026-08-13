from datetime import datetime
from zoneinfo import ZoneInfo

from app.data import CONCEPTS, PLACES, guide_for
from app.models import SolarResult, WeatherResult
from app.services.scoring import (
    _status_for_total,
    evaluate,
    recommend_shooting_azimuth,
    select_best_index,
)
from app.services.solar import add_lighting_risk, calculate_solar_position
from app.services.place_search import infer_place_type
from app.services.travel import estimate_travel, estimate_travel_by_mode
from app.services.tourism import normalize_place_name, tourism_trend_from_dataset
from app.services.weather import (
    _select_forecast,
    latitude_longitude_to_grid,
    latest_short_base,
)


KST = ZoneInfo("Asia/Seoul")


def test_kma_grid_conversion_matches_seoul_reference() -> None:
    assert latitude_longitude_to_grid(37.5665, 126.9780) == (60, 127)


def test_weather_uses_nearest_hour_instead_of_always_rounding_up() -> None:
    items = []
    for forecast_time, rain in (("0500", "강수없음"), ("0600", "1.0mm")):
        for category, value in (("RN1", rain), ("WSD", "2.0"), ("SKY", "4")):
            items.append(
                {
                    "fcstDate": "20260813",
                    "fcstTime": forecast_time,
                    "category": category,
                    "fcstValue": value,
                }
            )

    result = _select_forecast(
        items,
        datetime(2026, 8, 13, 5, 23, tzinfo=KST),
    )

    assert result.forecast_time == datetime(2026, 8, 13, 5, 0, tzinfo=KST)
    assert result.precipitation_mm == 0.0


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
    assert result.scores.total >= 70


def test_user_friendly_status_boundary_treats_74_as_good() -> None:
    assert _status_for_total(74) == "가능"
    assert _status_for_total(70) == "가능"
    assert _status_for_total(69) == "보통"
    assert _status_for_total(49) == "비추천"


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


def test_sunset_concept_is_rejected_at_high_noon() -> None:
    weather = WeatherResult(
        precipitation_mm=0.0,
        wind_speed_mps=2.0,
        sky="맑음",
        forecast_time=datetime(2026, 8, 5, 13, tzinfo=KST),
    )
    solar = SolarResult(elevation=65.0, azimuth=220.0, ghi_wm2=950, dni_wm2=850)
    result = evaluate(PLACES["hyeopjae"], CONCEPTS["sunset"], weather, solar)
    assert result.status == "비추천"
    assert result.scores.total < 40


def test_high_lighting_risk_cannot_be_hidden_by_good_weather() -> None:
    weather = WeatherResult(
        precipitation_mm=0.0,
        wind_speed_mps=2.0,
        sky="맑음",
        forecast_time=datetime(2026, 8, 5, 15, tzinfo=KST),
    )
    solar = SolarResult(
        elevation=42.0,
        azimuth=205.0,
        ghi_wm2=850,
        dni_wm2=800,
        lighting_risk="높음",
        lighting_risk_score=78,
        lighting_issue="나뭇잎 사이 얼룩 그림자",
    )
    result = evaluate(PLACES["saryeoni"], CONCEPTS["refreshing"], weather, solar)
    assert result.status == "보통"
    assert 50 <= result.scores.total < 70


def test_severe_rain_is_rejected_even_when_other_scores_are_good() -> None:
    weather = WeatherResult(
        precipitation_mm=3.0,
        wind_speed_mps=3.0,
        sky="구름 많음",
        forecast_time=datetime(2026, 8, 5, 16, tzinfo=KST),
    )
    solar = SolarResult(elevation=25.0, azimuth=115.0, ghi_wm2=400, dni_wm2=250)
    result = evaluate(PLACES["saryeoni"], CONCEPTS["film"], weather, solar)
    assert result.status == "비추천"
    assert 30 <= result.scores.total < 49


def test_custom_place_does_not_receive_perfect_direction_score() -> None:
    from dataclasses import replace

    custom = replace(PLACES["hyeopjae"], id="custom")
    weather = WeatherResult(
        precipitation_mm=0.0,
        wind_speed_mps=2.0,
        sky="맑음",
        forecast_time=datetime(2026, 8, 5, 15, tzinfo=KST),
    )
    solar = SolarResult(elevation=42.0, azimuth=95.0)
    result = evaluate(custom, CONCEPTS["refreshing"], weather, solar)
    assert result.scores.light_direction == 75


def test_all_five_concepts_have_complete_guides() -> None:
    weather = WeatherResult(
        precipitation_mm=0.0,
        wind_speed_mps=2.0,
        sky="구름 많음",
        forecast_time=datetime(2026, 8, 5, 16, tzinfo=KST),
    )
    solar = SolarResult(elevation=28.0, azimuth=240.0, ghi_wm2=420, dni_wm2=250)
    assert set(CONCEPTS) == {
        "refreshing", "natural", "sunset", "film", "sparkling"
    }
    for concept in CONCEPTS.values():
        guide = guide_for(PLACES["hyeopjae"], concept, "photo", weather, solar)
        assert len(guide) == 4
        assert any("거리 기준:" in step for step in guide)
        assert any("예상 결과:" in step for step in guide)


def test_place_type_is_inferred_from_kakao_category() -> None:
    assert infer_place_type("함덕해수욕장", "여행 > 관광,명소 > 해수욕장") == "beach"
    assert infer_place_type("사려니숲길", "여행 > 관광,명소 > 숲") == "forest"
    assert infer_place_type("제주도립미술관", "문화,예술 > 미술관") == "indoor"


def test_shooting_direction_follows_concept_light_relationship() -> None:
    solar = SolarResult(elevation=12.0, azimuth=250.0)
    assert recommend_shooting_azimuth(CONCEPTS["refreshing"], solar) == 70.0
    assert recommend_shooting_azimuth(CONCEPTS["film"], solar) == 160.0
    assert recommend_shooting_azimuth(CONCEPTS["sunset"], solar) == 250.0


def test_daylight_irradiance_and_sea_reflection_are_estimated() -> None:
    solar = calculate_solar_position(
        33.3941,
        126.2397,
        datetime(2026, 8, 5, 18, 0, tzinfo=KST),
        "맑음",
    )
    assert solar.ghi_wm2 > 0
    assert solar.dni_wm2 > 0
    toward_sun = add_lighting_risk(
        solar, "beach", solar.azimuth, wind_speed_mps=3.0
    )
    away_from_sun = add_lighting_risk(
        solar, "beach", (solar.azimuth + 180) % 360, wind_speed_mps=3.0
    )
    assert toward_sun.lighting_risk_score > away_from_sun.lighting_risk_score
    assert toward_sun.lighting_issue == "수면 반사와 역광"


def test_place_types_get_different_lighting_issues() -> None:
    strong_sun = SolarResult(
        elevation=42.0,
        azimuth=180.0,
        ghi_wm2=820,
        dni_wm2=780,
        dhi_wm2=100,
    )
    forest = add_lighting_risk(
        strong_sun, "forest", 180.0, wind_speed_mps=4.0
    )
    urban = add_lighting_risk(
        strong_sun,
        "urban",
        180.0,
        wind_speed_mps=2.0,
        precipitation_mm=0.5,
    )
    indoor = add_lighting_risk(
        strong_sun, "indoor", 180.0, wind_speed_mps=0.0
    )
    assert forest.lighting_issue == "나뭇잎 사이 얼룩 그림자"
    assert urban.lighting_issue == "유리·젖은 노면 반사"
    assert indoor.lighting_issue == "창문 역광과 실내외 명암차"
    assert {forest.lighting_risk, urban.lighting_risk, indoor.lighting_risk} == {"높음"}


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


def test_best_time_avoids_long_wait_for_small_score_difference() -> None:
    from types import SimpleNamespace

    evaluations = [
        SimpleNamespace(status="가능", scores=SimpleNamespace(total=86)),
        SimpleNamespace(status="가능", scores=SimpleNamespace(total=88)),
        SimpleNamespace(status="가능", scores=SimpleNamespace(total=90)),
    ]
    assert select_best_index(evaluations) == 0


def test_best_time_uses_arrival_immediately_when_it_is_already_good() -> None:
    from types import SimpleNamespace

    evaluations = [
        SimpleNamespace(status="가능", scores=SimpleNamespace(total=80)),
        SimpleNamespace(status="가능", scores=SimpleNamespace(total=87)),
        SimpleNamespace(status="가능", scores=SimpleNamespace(total=96)),
    ]
    assert select_best_index(evaluations) == 0


def test_film_concept_accepts_moody_beach_at_night() -> None:
    weather = WeatherResult(
        precipitation_mm=0.0,
        wind_speed_mps=2.5,
        sky="구름 많음",
        forecast_time=datetime(2026, 8, 12, 22, tzinfo=KST),
    )
    solar = SolarResult(
        elevation=-25.0,
        azimuth=310.0,
        ghi_wm2=0,
        dni_wm2=0,
        dhi_wm2=0,
        lighting_risk="높음",
        lighting_risk_score=85,
        lighting_issue="자연광 부족",
    )
    result = evaluate(PLACES["hyeopjae"], CONCEPTS["film"], weather, solar)
    assert result.status == "가능"
    assert result.scores.total >= 70
    assert any("야간 모드" in reason for reason in result.reasons)


def test_tourism_trend_matches_alias_and_explains_monthly_limit() -> None:
    dataset = {
        "reference_month": "202607",
        "source": "제주관광빅데이터플랫폼·티맵 내비게이션 O-D 데이터",
        "source_url": "https://data.ijto.or.kr/example",
        "places": [
            {"name": "동문재래시장", "arrivals": 12079, "rank": 3},
            {"name": "함덕해수욕장", "arrivals": 11160, "rank": 4},
        ],
    }
    result = tourism_trend_from_dataset(
        "동문시장", dataset, source_kind="snapshot"
    )
    assert normalize_place_name("동문시장") == "동문재래시장"
    assert result.available is True
    assert result.level == "높음"
    assert result.rank == 3
    assert result.arrivals == 12079
    assert result.is_realtime is False
    assert "실시간 혼잡도가 아니라" in result.explanation


def test_tourism_trend_does_not_call_unmatched_place_quiet() -> None:
    dataset = {
        "reference_month": "202607",
        "source": "제주관광빅데이터플랫폼",
        "source_url": "https://data.ijto.or.kr/example",
        "places": [{"name": "함덕해수욕장", "arrivals": 11160, "rank": 1}],
    }
    result = tourism_trend_from_dataset(
        "사려니숲길", dataset, source_kind="snapshot"
    )
    assert result.available is False
    assert result.level == "자료 없음"
    assert "한산하다고 판단할 수는 없어요" in result.explanation
