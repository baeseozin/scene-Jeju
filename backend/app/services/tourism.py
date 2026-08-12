import json
import re
from pathlib import Path
from typing import Any

import httpx

from ..config import Settings
from ..models import TourismTrendResult


IJTO_DATA_URL = (
    "https://data.ijto.or.kr/prog/dataPick/bigdata/sub02/view.do?regSn=48"
)
IJTO_CHART_URL = "https://data.ijto.or.kr/api/dataPick/chart/renderChart.do"
SNAPSHOT_PATH = (
    Path(__file__).resolve().parents[1]
    / "datasets"
    / "ijto_tourist_arrivals_top10.json"
)
ALIASES = {
    "동문시장": "동문재래시장",
    "동문재래시장야시장": "동문재래시장",
    "서귀포올레시장": "서귀포매일올레시장",
    "매일올레시장": "서귀포매일올레시장",
    "이호테우해수욕장": "이호테우해변",
    "이호해수욕장": "이호테우해변",
}


def normalize_place_name(name: str) -> str:
    normalized = re.sub(r"[^0-9A-Za-z가-힣]", "", name).lower()
    normalized = normalized.removeprefix("제주특별자치도")
    normalized = normalized.removeprefix("제주도")
    return ALIASES.get(normalized, normalized)


def _load_snapshot() -> dict[str, Any]:
    return json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))


async def _fetch_latest_top10() -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Referer": IJTO_DATA_URL,
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
        ),
    }
    payload = {
        "regSn": "48",
        "chartIndex": 0,
        "searchDataBgnDt": "",
        "searchDataEndDt": "",
    }
    async with httpx.AsyncClient(timeout=5.0, headers=headers) as client:
        response = await client.post(IJTO_CHART_URL, json=payload)
        response.raise_for_status()
        body = response.json()

    chart = body["data"]["charts"][0]
    rows = chart["data"]
    if not rows:
        raise ValueError("제주 관광지 도착 순위가 비어 있습니다.")

    return {
        "dataset_name": "제주 지역별 관광지 도착",
        "reference_month": str(chart["dataEndDt"]),
        "source": "제주관광빅데이터플랫폼·티맵 내비게이션 O-D 데이터",
        "source_url": IJTO_DATA_URL,
        "is_realtime": False,
        "places": [
            {
                "name": str(row["groupVal"]),
                "arrivals": int(row["sumVal"]),
                "rank": rank,
            }
            for rank, row in enumerate(rows, start=1)
        ],
    }


def _names_match(requested: str, candidate: str) -> bool:
    left = normalize_place_name(requested)
    right = normalize_place_name(candidate)
    if left == right:
        return True
    return min(len(left), len(right)) >= 4 and (left in right or right in left)


def _trend_level(rank: int) -> tuple[str, str, str]:
    if rank <= 3:
        return (
            "높음",
            "매우 붐빌 수 있어요",
            "주요 배경의 정면을 피하고 옆으로 8~12m 이동해 인물이 겹치지 않는 각도를 잡으세요.",
        )
    if rank <= 7:
        return (
            "보통",
            "붐빌 수 있어요",
            "주요 배경에서 옆으로 5~8m 이동하고, 사람 사이가 비는 순간에 촬영을 시작하세요.",
        )
    return (
        "낮음",
        "TOP 10 안에서는 비교적 여유로워요",
        "넓은 배경을 담아도 좋지만 현장 방문객 흐름을 먼저 1분 정도 확인하세요.",
    )


def tourism_trend_from_dataset(
    place_name: str,
    dataset: dict[str, Any],
    *,
    source_kind: str,
) -> TourismTrendResult:
    places = dataset.get("places", [])
    match = next(
        (
            row
            for row in places
            if _names_match(place_name, str(row.get("name", "")))
        ),
        None,
    )
    reference_month = str(dataset.get("reference_month", "")) or None
    source = str(dataset.get("source", "제주관광빅데이터플랫폼"))
    source_url = str(dataset.get("source_url", IJTO_DATA_URL))

    if match is None:
        return TourismTrendResult(
            available=False,
            level="자료 없음",
            label="최근 TOP 10에서 같은 장소를 찾지 못했어요",
            reference_month=reference_month,
            source=source,
            source_url=source_url,
            source_kind=source_kind,
            is_realtime=False,
            explanation=(
                "이 결과만으로 한산하다고 판단할 수는 없어요. "
                "월간 인기 장소 TOP 10에 같은 이름이 있는지만 확인한 값입니다."
            ),
            shooting_tip="현장에 도착하면 방문객 흐름을 1분 정도 확인한 뒤 촬영하세요.",
        )

    rank = int(match["rank"])
    level, label, shooting_tip = _trend_level(rank)
    return TourismTrendResult(
        available=True,
        level=level,
        label=label,
        matched_place_name=str(match["name"]),
        arrivals=int(match["arrivals"]),
        rank=rank,
        ranked_places=len(places),
        reference_month=reference_month,
        source=source,
        source_url=source_url,
        source_kind=source_kind,
        is_realtime=False,
        explanation=(
            f"{reference_month[:4]}년 {int(reference_month[4:])}월 내비게이션 차량 도착 "
            f"인기 장소 TOP {len(places)} 중 {rank}위입니다. 실시간 혼잡도가 아니라 "
            "최근 방문 경향입니다."
            if reference_month and len(reference_month) == 6
            else "내비게이션 차량 도착 인기 장소 순위이며 실시간 혼잡도가 아닙니다."
        ),
        shooting_tip=shooting_tip,
    )


async def get_tourism_trend(
    place_name: str, settings: Settings
) -> TourismTrendResult:
    if settings.app_mode != "mock":
        try:
            latest = await _fetch_latest_top10()
            return tourism_trend_from_dataset(place_name, latest, source_kind="live")
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            pass

    return tourism_trend_from_dataset(
        place_name,
        _load_snapshot(),
        source_kind="snapshot",
    )
