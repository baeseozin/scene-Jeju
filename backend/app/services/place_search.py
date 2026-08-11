import asyncio
from typing import Any, Literal

import httpx

from ..config import Settings
from ..models import PlaceSearchResult


KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
KAKAO_CATEGORY_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/category.json"
KAKAO_COORD2ADDRESS_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
JEJU_BOUNDS = {
    "min_latitude": 33.05,
    "max_latitude": 33.65,
    "min_longitude": 125.95,
    "max_longitude": 127.05,
}


class PlaceSearchError(RuntimeError):
    pass


def infer_place_type(
    name: str, category: str
) -> Literal["beach", "forest", "urban", "indoor"]:
    text = f"{name} {category}".lower()
    if any(word in text for word in ("해수욕장", "해변", "해안", "바다", "포구", "항구")):
        return "beach"
    if any(
        word in text
        for word in ("숲", "오름", "수목원", "휴양림", "산", "공원", "정원", "산책로", "폭포")
    ):
        return "forest"
    if any(
        word in text
        for word in ("박물관", "미술관", "전시", "카페", "호텔", "리조트", "실내")
    ):
        return "indoor"
    return "urban"


def _is_in_jeju(latitude: float, longitude: float) -> bool:
    return (
        JEJU_BOUNDS["min_latitude"] <= latitude <= JEJU_BOUNDS["max_latitude"]
        and JEJU_BOUNDS["min_longitude"] <= longitude <= JEJU_BOUNDS["max_longitude"]
    )


def _map_document(document: dict[str, Any]) -> PlaceSearchResult | None:
    try:
        latitude = float(document["y"])
        longitude = float(document["x"])
    except (KeyError, TypeError, ValueError):
        return None
    if not _is_in_jeju(latitude, longitude):
        return None

    name = str(document.get("place_name", "")).strip()
    category = str(document.get("category_name", "")).strip()
    if not name:
        return None
    return PlaceSearchResult(
        id=str(document.get("id", f"{longitude},{latitude}")),
        name=name,
        address=str(
            document.get("road_address_name") or document.get("address_name") or "제주"
        ),
        latitude=latitude,
        longitude=longitude,
        category=category,
        place_type=infer_place_type(name, category),
    )


async def search_jeju_places(query: str, settings: Settings) -> list[PlaceSearchResult]:
    if not settings.kakao_rest_api_key:
        raise PlaceSearchError(
            "장소 자동 검색을 사용하려면 KAKAO_REST_API_KEY를 설정해야 합니다."
        )

    search_query = query.strip()
    if "제주" not in search_query:
        search_query = f"제주 {search_query}"

    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            response = await client.get(
                KAKAO_KEYWORD_SEARCH_URL,
                params={"query": search_query, "size": 10, "sort": "accuracy"},
                headers={
                    "Authorization": f"KakaoAK {settings.kakao_rest_api_key}",
                },
            )
            response.raise_for_status()
            documents = response.json().get("documents", [])
    except (httpx.HTTPError, TypeError, ValueError) as exc:
        raise PlaceSearchError(f"장소 검색에 실패했습니다: {exc}") from exc

    results = [result for item in documents if (result := _map_document(item))]
    return results[:5]


async def reverse_jeju_place(
    latitude: float, longitude: float, settings: Settings
) -> PlaceSearchResult:
    """선택 좌표 주변의 가장 가까운 장소를 찾고 없으면 도로명 주소를 반환합니다."""
    if not settings.kakao_rest_api_key:
        raise PlaceSearchError(
            "지도 좌표의 장소명을 확인하려면 KAKAO_REST_API_KEY가 필요합니다."
        )
    if not _is_in_jeju(latitude, longitude):
        raise PlaceSearchError("제주도 안의 촬영 지점을 선택해 주세요.")

    headers = {"Authorization": f"KakaoAK {settings.kakao_rest_api_key}"}
    try:
        async with httpx.AsyncClient(timeout=7.0, headers=headers) as client:
            address_request = client.get(
                KAKAO_COORD2ADDRESS_URL,
                params={"x": longitude, "y": latitude, "input_coord": "WGS84"},
            )
            category_requests = [
                client.get(
                    KAKAO_CATEGORY_SEARCH_URL,
                    params={
                        "category_group_code": category_code,
                        "x": longitude,
                        "y": latitude,
                        "radius": 300,
                        "sort": "distance",
                        "size": 5,
                    },
                )
                for category_code in ("AT4", "CT1", "CE7", "AD5")
            ]
            responses = await asyncio.gather(address_request, *category_requests)
        for response in responses:
            response.raise_for_status()

        nearby_documents = [
            document
            for response in responses[1:]
            for document in response.json().get("documents", [])
        ]
        nearby_documents.sort(
            key=lambda document: float(document.get("distance") or 999999)
        )
        if nearby_documents:
            mapped = _map_document(nearby_documents[0])
            if mapped:
                return mapped

        address_documents = responses[0].json().get("documents", [])
        if address_documents:
            address_document = address_documents[0]
            road = address_document.get("road_address") or {}
            parcel = address_document.get("address") or {}
            address = str(
                road.get("address_name")
                or parcel.get("address_name")
                or "제주도 지도 선택 지점"
            )
        else:
            address = "제주도 지도 선택 지점"
        return PlaceSearchResult(
            id=f"map-{longitude:.6f}-{latitude:.6f}",
            name=address,
            address=address,
            latitude=latitude,
            longitude=longitude,
            category="지도 선택 위치",
            place_type="urban",
        )
    except PlaceSearchError:
        raise
    except (httpx.HTTPError, TypeError, ValueError) as exc:
        raise PlaceSearchError(f"지도 주변 장소를 확인하지 못했습니다: {exc}") from exc
