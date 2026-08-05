from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


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
    assert body["arrival_time"] > body["departure_time"]
    assert body["status"] in {"가능", "보통", "비추천"}
    assert len(body["guide"]) == 4
    assert 0 <= body["scores"]["total"] <= 100


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

