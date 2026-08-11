from dataclasses import dataclass

from .models import CaptureMode, ConceptPublic, PlacePublic


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    description: str
    place_type: str
    latitude: float
    longitude: float
    shooting_azimuth: float
    direction_label: str
    accent: str

    def public(self) -> PlacePublic:
        return PlacePublic(**self.__dict__)


@dataclass(frozen=True)
class Concept:
    id: str
    name: str
    description: str
    accent: str
    max_precipitation_mm: float
    max_wind_mps: float
    preferred_skies: tuple[str, ...]
    min_solar_elevation: float
    max_solar_elevation: float
    target_sun_offset: float
    suitable_place_types: tuple[str, ...]

    def public(self) -> ConceptPublic:
        return ConceptPublic(
            id=self.id,
            name=self.name,
            description=self.description,
            accent=self.accent,
        )


PLACES: dict[str, Place] = {
    "hyeopjae": Place(
        id="hyeopjae",
        name="협재해수욕장",
        description="에메랄드빛 바다와 비양도를 함께 담는 서쪽 해변",
        place_type="beach",
        latitude=33.3941,
        longitude=126.2397,
        shooting_azimuth=275.0,
        direction_label="비양도가 보이는 서쪽",
        accent="#66d4e8",
    ),
    "saryeoni": Place(
        id="saryeoni",
        name="사려니숲길",
        description="수직으로 뻗은 삼나무와 깊은 원근감이 살아나는 숲길",
        place_type="forest",
        latitude=33.4087,
        longitude=126.6265,
        shooting_azimuth=25.0,
        direction_label="삼나무 길이 깊어지는 북동쪽",
        accent="#79b88a",
    ),
    "dodu": Place(
        id="dodu",
        name="도두동 무지개해안도로",
        description="알록달록한 방호벽과 바다, 항공기까지 담기는 해안 도심",
        place_type="urban",
        latitude=33.5058,
        longitude=126.4685,
        shooting_azimuth=330.0,
        direction_label="바다가 열리는 북서쪽",
        accent="#f7a76c",
    ),
}


CONCEPTS: dict[str, Concept] = {
    "refreshing": Concept(
        id="refreshing",
        name="청량한 여행",
        description="밝고 선명한 색감, 자연스러운 움직임",
        accent="#32b5cc",
        max_precipitation_mm=0.2,
        max_wind_mps=6.0,
        preferred_skies=("맑음", "구름 많음"),
        min_solar_elevation=15.0,
        max_solar_elevation=65.0,
        target_sun_offset=180.0,
        suitable_place_types=("beach", "urban"),
    ),
    "film": Concept(
        id="film",
        name="감성 필름",
        description="부드러운 명암과 천천히 흐르는 장면",
        accent="#b89b73",
        max_precipitation_mm=0.8,
        max_wind_mps=8.0,
        preferred_skies=("구름 많음", "흐림"),
        min_solar_elevation=5.0,
        max_solar_elevation=40.0,
        target_sun_offset=90.0,
        suitable_place_types=("forest", "urban"),
    ),
    "sunset": Concept(
        id="sunset",
        name="노을 실루엣",
        description="낮은 태양을 배경으로 인물의 윤곽을 강조",
        accent="#ef765f",
        max_precipitation_mm=0.1,
        max_wind_mps=7.0,
        preferred_skies=("맑음", "구름 많음"),
        min_solar_elevation=-3.0,
        max_solar_elevation=15.0,
        target_sun_offset=0.0,
        suitable_place_types=("beach", "urban"),
    ),
}


GUIDES: dict[tuple[str, str], list[str]] = {
    ("hyeopjae", "refreshing"): [
        "물가에서 3m 떨어져 비양도가 인물의 어깨 옆에 오도록 세로 구도를 잡습니다.",
        "인물이 카메라 쪽으로 두 걸음 걸어오는 장면을 3초간 촬영합니다.",
        "카메라를 허리 높이에서 오른쪽으로 천천히 이동하며 바다색을 넓게 담습니다.",
        "마지막 2초는 인물이 바다를 돌아보는 순간에 멈춰 여백을 남깁니다.",
    ],
    ("hyeopjae", "film"): [
        "젖은 모래의 반사가 보이도록 카메라를 무릎 높이로 낮춥니다.",
        "인물을 화면 오른쪽 1/3에 두고 파도가 들어오는 순간을 3초간 고정 촬영합니다.",
        "초점을 손끝에서 비양도로 천천히 옮기며 2초간 촬영합니다.",
        "걸어 나가는 뒷모습을 흔들림이 약간 남도록 천천히 따라갑니다.",
    ],
    ("hyeopjae", "sunset"): [
        "태양이 인물의 어깨 바로 위에 오도록 서쪽을 향해 위치를 조정합니다.",
        "화면 밝기를 낮춰 얼굴보다 윤곽선과 하늘색을 살립니다.",
        "인물이 옆모습으로 서서 고개를 드는 장면을 3초간 고정 촬영합니다.",
        "마지막에는 카메라를 아래에서 위로 올려 하늘이 화면의 2/3를 차지하게 합니다.",
    ],
    ("saryeoni", "refreshing"): [
        "길 중앙의 소실점과 인물의 머리가 겹치지 않도록 인물을 왼쪽에 둡니다.",
        "인물이 나뭇잎을 스치며 걷는 모습을 앞에서 3초간 촬영합니다.",
        "카메라를 가슴 높이로 유지하고 인물과 같은 속도로 뒤로 이동합니다.",
        "마지막 2초는 위로 틸트해 삼나무 높이를 강조합니다.",
    ],
    ("saryeoni", "film"): [
        "숲길 가장자리의 어두운 나무줄기를 전경으로 두고 인물을 중앙에 배치합니다.",
        "인물이 프레임 안으로 천천히 들어와 멈추는 장면을 4초간 촬영합니다.",
        "가까운 나뭇잎에서 인물의 얼굴로 초점을 천천히 전환합니다.",
        "마지막 2초는 고정 구도로 두고 바람에 흔들리는 잎을 함께 담습니다.",
    ],
    ("saryeoni", "sunset"): [
        "나무 사이로 빛이 들어오는 지점을 찾아 인물을 빛과 카메라 사이에 세웁니다.",
        "노출을 낮추고 인물의 옆얼굴 윤곽이 드러나는지 확인합니다.",
        "카메라를 고정한 채 인물이 프레임을 가로지르는 장면을 3초간 촬영합니다.",
        "마지막에는 빛이 번지는 나뭇가지 쪽으로 천천히 올려 촬영합니다.",
    ],
    ("dodu", "refreshing"): [
        "무지개 방호벽의 반복 선이 대각선이 되도록 카메라를 살짝 기울여 잡습니다.",
        "인물이 방호벽을 따라 뛰듯 걷는 모습을 옆에서 3초간 따라갑니다.",
        "카메라를 인물 뒤로 이동하며 바다와 하늘이 열리는 순간을 담습니다.",
        "마지막 2초는 손을 흔들거나 뒤돌아보는 동작으로 마무리합니다.",
    ],
    ("dodu", "film"): [
        "방호벽 하나를 전경에 크게 두고 인물을 화면 중앙보다 약간 뒤에 배치합니다.",
        "인물이 바다를 바라보는 정지 장면을 3초간 촬영합니다.",
        "방호벽 색을 따라 카메라를 낮고 느리게 수평 이동합니다.",
        "마지막에는 초점을 인물에서 멀어지는 항공기나 수평선으로 옮깁니다.",
    ],
    ("dodu", "sunset"): [
        "북서쪽 수평선의 태양과 인물이 겹치는 지점까지 해안선을 따라 이동합니다.",
        "인물을 화면 아래쪽에 작게 두고 노을 하늘을 넓게 확보합니다.",
        "인물이 방호벽 위로 손을 뻗는 동작을 3초간 고정 촬영합니다.",
        "마지막 2초는 카메라를 천천히 뒤로 빼며 방호벽 색과 실루엣을 함께 담습니다.",
    ],
}


DIRECTION_NAMES = {
    0: "북쪽",
    45: "북동쪽",
    90: "동쪽",
    135: "남동쪽",
    180: "남쪽",
    225: "남서쪽",
    270: "서쪽",
    315: "북서쪽",
}


def direction_label(azimuth: float) -> str:
    nearest = round(azimuth / 45) * 45 % 360
    return DIRECTION_NAMES[nearest]


def custom_place_guide(place: Place, concept: Concept) -> list[str]:
    """사용자 입력 장소를 유형·콘셉트 기반 템플릿으로 안내합니다."""
    type_opening = {
        "beach": "수평선이 기울지 않도록 맞추고 인물을 화면의 1/3 지점에 배치합니다.",
        "forest": "길이나 나무가 만드는 소실점을 찾고 인물이 그 선을 가리지 않게 배치합니다.",
        "urban": "건물이나 도로의 반복 선을 활용해 인물 쪽으로 시선이 모이게 구도를 잡습니다.",
        "indoor": "창문이나 주 조명에서 45° 옆으로 인물을 세우고 배경과 거리를 확보합니다.",
    }[place.place_type]
    concept_action = {
        "refreshing": "인물이 카메라 쪽으로 자연스럽게 두 걸음 움직이는 장면을 3초간 촬영합니다.",
        "film": "가까운 사물에서 인물로 초점을 천천히 옮기며 3초간 촬영합니다.",
        "sunset": "노출을 조금 낮추고 인물의 옆모습 윤곽이 드러나는 장면을 3초간 촬영합니다.",
    }[concept.id]
    return [
        type_opening,
        shooting_direction_guide(place, concept),
        concept_action,
        "마지막 2초는 카메라를 천천히 뒤로 이동해 장소의 분위기가 넓게 보이도록 마무리합니다.",
    ]


def photo_guide(place: Place, concept: Concept) -> list[str]:
    background = {
        "beach": "수평선을 반듯하게 맞추고 바다가 화면의 절반 이상 보이는 세로 구도를 잡습니다.",
        "forest": "숲길의 소실점이 인물 쪽으로 모이게 하고 발끝이 잘리지 않도록 전신을 담습니다.",
        "urban": "건물이나 도로의 반복 선이 인물을 향하도록 화면의 1/3 지점에 배치합니다.",
        "indoor": "창문에서 한 걸음 떨어져 얼굴에 빛이 고르게 닿는 자리에 인물을 세웁니다.",
    }[place.place_type]
    pose = {
        "refreshing": "인물이 카메라를 보지 않고 걷다가 뒤돌아보는 순간을 연속 촬영합니다.",
        "film": "손이나 가까운 소품을 전경에 두고 인물의 시선이 프레임 밖을 향하게 촬영합니다.",
        "sunset": "화면 밝기를 낮춘 뒤 옆모습과 하늘의 색이 함께 살아나는 노출로 촬영합니다.",
    }[concept.id]
    return [
        background,
        shooting_direction_guide(place, concept),
        pose,
        "같은 자리에서 전신, 허리 위, 배경 중심 구도를 한 장씩 남겨 가장 자연스러운 컷을 고릅니다.",
    ]


def guide_for(
    place: Place, concept: Concept, capture_mode: CaptureMode = "video"
) -> list[str]:
    if capture_mode == "photo":
        return photo_guide(place, concept)
    return GUIDES.get((place.id, concept.id)) or custom_place_guide(place, concept)


def shooting_direction_guide(place: Place, concept: Concept) -> str:
    background = {
        "beach": "바다가 인물 뒤에 넓게 보이도록 자리를 잡고",
        "forest": "숲길이 인물 뒤로 길게 이어지도록 자리를 잡고",
        "urban": "거리와 건물의 선이 인물 뒤로 이어지도록 자리를 잡고",
        "indoor": "창문이나 가장 밝은 조명이 인물 가까이에 오도록 자리를 잡고",
    }[place.place_type]
    light_action = {
        "refreshing": "촬영자는 태양을 등진 채 인물을 바라보세요.",
        "film": "햇빛이 인물의 옆얼굴을 스치도록 촬영자가 옆으로 이동하세요.",
        "sunset": "카메라가 노을을 바라보게 하고 인물을 노을 앞에 세우세요.",
    }[concept.id]
    return f"{background}, {light_action}"
