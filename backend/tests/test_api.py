import pytest
from fastapi.testclient import TestClient

from app.main import app, settings
from app.models import PlaceSearchResult


client = TestClient(app)


@pytest.fixture(autouse=True)
def disable_external_route_calls(monkeypatch) -> None:
    """자동 테스트가 로컬 .env 값에 따라 외부 API를 호출하지 않게 합니다."""
    monkeypatch.setattr(settings, "kakao_rest_api_key", "")
    monkeypatch.setattr(settings, "app_mode", "mock")


def test_catalog_has_three_places_and_concepts() -> None:
    response = client.get("/api/catalog")
    assert response.status_code == 200
    body = response.json()
    assert len(body["places"]) == 3
    assert len(body["concepts"]) == 3


def test_mock_analysis_returns_complete_result() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "current_location": {
                "latitude": 33.5104,
                "longitude": 126.4914,
            },
            "place_id": "hyeopjae",
            "concept_id": "refreshing",
            "departure_time": "2026-08-05T05:00:00Z",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_source"] == "mock"
    assert body["travel_minutes"] > 0
    assert body["departure_time"].startswith("2026-08-05T14:00:00")
    assert body["arrival_time"] > body["departure_time"]
    assert body["status"] in {"가능", "보통", "비추천"}
    assert len(body["guide"]) == 4
    assert 0 <= body["scores"]["total"] <= 100
    assert len(body["time_slots"]) == 13
    assert sum(slot["is_best"] for slot in body["time_slots"]) == 1
    assert body["best_time"] in {slot["time"] for slot in body["time_slots"]}
    best_slot = next(slot for slot in body["time_slots"] if slot["is_best"])
    assert body["scores"]["total"] == best_slot["score"]
    assert body["status"] == best_slot["status"]
    assert body["weather"] == best_slot["weather"]
    assert body["solar"] == best_slot["solar"]
    assert body["travel_source"] == "estimated"
    assert body["capture_mode"] == "video"
    assert any("비양도" in step for step in body["guide"])
    assert any("태양 고도" in step for step in body["guide"])
    assert any("풍속" in step for step in body["guide"])
    assert "방위각" in body["shooting_direction_guide"]
    assert body["solar"]["ghi_wm2"] >= 0
    assert body["solar"]["lighting_risk"] in {"낮음", "보통", "높음"}
    assert body["solar"]["lighting_issue"]
    assert any("예상 일사량" in step for step in body["guide"])


def test_custom_place_is_used_for_analysis() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "current_location": {
                "latitude": 33.5104,
                "longitude": 126.4914,
            },
            "place": {
                "name": "함덕해수욕장",
                "latitude": 33.5431,
                "longitude": 126.6692,
                "place_type": "beach",
            },
            "concept_id": "refreshing",
            "departure_time": "2026-08-05T05:00:00Z",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["place"]["id"] == "custom"
    assert body["place"]["name"] == "함덕해수욕장"
    assert body["place"]["latitude"] == 33.5431
    expected_direction = round((body["solar"]["azimuth"] - 180) % 360, 1)
    assert body["place"]["shooting_azimuth"] == expected_direction
    assert body["place"]["direction_label"] != "분석 후 계산"
    assert "태양을 등진 채" in body["shooting_direction_guide"]
    assert "바다가 인물 뒤" in body["shooting_direction_guide"]
    assert any("촬영자가 설 위치" in reason for reason in body["reasons"])
    assert len(body["guide"]) == 4


def test_unknown_place_returns_404() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "current_location": {"latitude": 33.5, "longitude": 126.5},
            "place_id": "unknown",
            "concept_id": "refreshing",
        },
    )
    assert response.status_code == 404


def test_photo_and_transit_options_are_reflected() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "current_location": {"latitude": 33.5104, "longitude": 126.4914},
            "place": {
                "name": "제주도립미술관",
                "latitude": 33.4526,
                "longitude": 126.4897,
                "place_type": "indoor",
            },
            "concept_id": "film",
            "capture_mode": "photo",
            "transport_mode": "transit",
            "departure_time": "2026-08-05T12:00:00+09:00",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["capture_mode"] == "photo"
    assert body["transport_mode"] == "transit"
    assert body["travel_source"] == "transit-estimated"
    assert any("같은 자리" in step for step in body["guide"])


def test_place_name_search_returns_coordinate_candidates(monkeypatch) -> None:
    async def fake_search(query, settings):
        assert query == "함덕해수욕장"
        return [
            PlaceSearchResult(
                id="123",
                name="함덕해수욕장",
                address="제주특별자치도 제주시 조천읍 조함해안로 525",
                latitude=33.5431,
                longitude=126.6692,
                category="여행 > 관광,명소 > 해수욕장",
                place_type="beach",
            )
        ]

    monkeypatch.setattr("app.main.search_jeju_places", fake_search)
    response = client.get("/api/places/search", params={"query": "함덕해수욕장"})
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["name"] == "함덕해수욕장"
    assert result["latitude"] == 33.5431
    assert result["longitude"] == 126.6692


def test_reverse_place_returns_nearby_name(monkeypatch) -> None:
    async def fake_reverse(latitude, longitude, settings):
        assert latitude == 33.5431
        assert longitude == 126.6692
        return PlaceSearchResult(
            id="456",
            name="함덕해수욕장",
            address="제주특별자치도 제주시 조천읍 조함해안로 525",
            latitude=latitude,
            longitude=longitude,
            category="여행 > 관광,명소 > 해수욕장",
            place_type="beach",
        )

    monkeypatch.setattr("app.main.reverse_jeju_place", fake_reverse)
    response = client.get(
        "/api/places/reverse",
        params={"latitude": 33.5431, "longitude": 126.6692},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "함덕해수욕장"
    assert response.json()["place_type"] == "beach"


def test_custom_destination_must_be_in_jeju() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "current_location": {"latitude": 37.5665, "longitude": 126.9780},
            "place": {
                "name": "서울광장",
                "latitude": 37.5665,
                "longitude": 126.9780,
                "place_type": "urban",
            },
            "concept_id": "film",
        },
    )
    assert response.status_code == 422


def test_sunset_searches_twelve_hours_after_arrival() -> None:
    response = client.post(
        "/api/analyze",
        json={
            "current_location": {"latitude": 33.5104, "longitude": 126.4914},
            "place_id": "dodu",
            "concept_id": "sunset",
            "departure_time": "2026-08-05T08:00:00+09:00",
        },
    )
    assert response.status_code == 200
    assert len(response.json()["time_slots"]) == 13
