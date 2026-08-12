from dataclasses import dataclass

from .models import (
    CaptureMode,
    ConceptPublic,
    PlacePublic,
    SolarResult,
    WeatherResult,
)


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
    place: Place,
    concept: Concept,
    capture_mode: CaptureMode = "video",
    weather: WeatherResult | None = None,
    solar: SolarResult | None = None,
) -> list[str]:
    if capture_mode == "photo":
        base_guide = photo_guide(place, concept)
    else:
        base_guide = GUIDES.get((place.id, concept.id)) or custom_place_guide(
            place, concept
        )

    if weather is None or solar is None:
        return base_guide

    old_direction = shooting_direction_guide(place, concept)
    second_action = "" if base_guide[1] == old_direction else f" {base_guide[1]}"
    return [
        f"{solar_height_explanation(solar)} {base_guide[0]}",
        f"{shooting_direction_guide(place, concept, solar)}{second_action}",
        f"{sky_and_wind_explanation(weather)} {base_guide[2]}",
        f"{rain_explanation(weather)} {base_guide[3]}",
    ]


def solar_height_explanation(solar: SolarResult) -> str:
    elevation = solar.elevation
    if elevation < -6:
        explanation = "태양이 지평선 아래에 있어 자연광이 거의 없는 시간이에요."
    elif elevation < 12:
        explanation = (
            "태양이 낮아 빛이 대기를 길게 지나오므로 색은 따뜻해지고 "
            "그림자는 길어져요."
        )
    elif elevation <= 55:
        explanation = (
            "태양이 중간 높이에 있어 빛은 충분하고, 그림자가 얼굴과 풍경의 "
            "입체감을 만들어줘요."
        )
    else:
        explanation = (
            "태양이 높아 빛이 강하고 그림자가 짧아지므로 얼굴 아래 명암이 "
            "진해질 수 있어요."
        )
    if solar.ghi_wm2 >= 700:
        irradiance = "빛의 양이 매우 많아 밝은 배경이나 하늘이 하얗게 날아가기 쉬워요."
    elif solar.ghi_wm2 >= 400:
        irradiance = "빛의 양이 충분해 손으로 들고 찍기 좋지만 밝은 부분의 노출은 확인해야 해요."
    elif solar.ghi_wm2 >= 120:
        irradiance = "빛의 양이 많지 않아 그림자는 부드럽지만 화면이 어두워질 수 있어요."
    else:
        irradiance = "자연광이 약해 휴대폰을 고정하거나 야간 모드를 쓰는 편이 좋아요."
    return (
        f"태양 고도는 {elevation:.1f}°, 예상 일사량은 {solar.ghi_wm2}W/m²예요. "
        f"{explanation} {irradiance}"
    )


def sky_and_wind_explanation(weather: WeatherResult) -> str:
    sky_explanation = {
        "맑음": "구름이 적어 직사광선이 강하고 밝은 곳과 그늘의 차이가 커요.",
        "구름 많음": "구름이 햇빛을 여러 방향으로 퍼뜨려 얼굴의 그림자가 부드러워져요.",
        "흐림": "구름이 햇빛을 넓게 퍼뜨려 그림자는 약하지만 색은 차분하게 보여요.",
    }[weather.sky]
    if weather.wind_speed_mps < 2:
        wind_explanation = "바람이 약해 카메라와 머리카락의 흔들림이 적어요."
    elif weather.wind_speed_mps < 5:
        wind_explanation = (
            "산들바람이 머리카락과 옷에 자연스러운 움직임을 만들어줘요."
        )
    else:
        wind_explanation = (
            "바람이 강해 화면이 흔들릴 수 있으니 두 손으로 고정하고 짧게 찍으세요."
        )
    return (
        f"하늘은 {weather.sky}, 풍속은 {weather.wind_speed_mps:.1f}m/s예요. "
        f"{sky_explanation} {wind_explanation}"
    )


def rain_explanation(weather: WeatherResult) -> str:
    rain = weather.precipitation_mm
    if rain <= 0:
        return "예상 강수량은 0mm라 렌즈에 빗방울이 맺힐 가능성이 낮아요."
    if rain < 1:
        return (
            f"예상 강수량은 {rain:.1f}mm예요. 약한 비가 지면을 적시면 빛이 "
            "반사되므로 반짝이는 바닥을 구도에 활용해 보세요."
        )
    return (
        f"예상 강수량은 {rain:.1f}mm예요. 빗방울이 빛을 흩뜨리고 렌즈에도 "
        "맺힐 수 있으니 처마 아래에서 렌즈를 자주 닦아주세요."
    )


def shooting_direction_guide(
    place: Place, concept: Concept, solar: SolarResult | None = None
) -> str:
    background = {
        "beach": "바다가 인물 뒤에 넓게 보이도록 자리를 잡으세요",
        "forest": "숲길이 인물 뒤로 길게 이어지도록 자리를 잡으세요",
        "urban": "거리와 건물의 선이 인물 뒤로 이어지도록 자리를 잡으세요",
        "indoor": "창문이나 가장 밝은 조명 가까이에 인물을 세우세요",
    }[place.place_type]
    light_action = {
        "refreshing": "촬영자는 태양을 등진 채 인물을 바라보세요.",
        "film": "햇빛이 인물의 옆얼굴을 스치도록 촬영자가 옆으로 이동하세요.",
        "sunset": "인물을 노을 앞에 세워 윤곽이 보이게 찍으세요.",
    }[concept.id]
    if solar is None:
        if place.place_type == "indoor":
            return (
                f"{background}. 창문을 정면으로 마주 보기보다 45° 옆에 서면 "
                "얼굴 한쪽에 부드러운 명암이 생겨요."
            )
        return f"{background}. {light_action}"
    if place.place_type == "indoor":
        direction_guide = (
            f"{background}. 바깥 예상 일사량은 {solar.ghi_wm2}W/m²예요. "
            "창문을 인물 뒤에 두지 말고 얼굴의 45° 옆에 두세요."
        )
        if solar.lighting_issue == "창문 역광과 실내외 명암차":
            return (
                f"{direction_guide} 창밖이 실내보다 훨씬 밝을 수 있으니 얼굴을 눌러 "
                "밝기를 맞추고, 창밖이 하얗게 날아가면 커튼으로 빛을 부드럽게 만드세요."
            )
        if solar.lighting_issue == "자연광 부족":
            return (
                f"{direction_guide} 자연광이 약하니 실내 조명을 켜고 휴대폰을 벽이나 "
                "삼각대에 고정하세요."
            )
        return f"{direction_guide} 지금은 창가와 실내의 밝기 차가 크지 않은 편이에요."
    if solar.elevation < -6:
        return (
            f"{background}. 태양이 이미 지평선 아래에 있으니 카메라는 "
            f"{place.direction_label}을 바라보고 야간 모드나 고정 지지대를 사용하세요."
        )
    sun_direction = direction_label(solar.azimuth)
    direction_guide = (
        f"{background}. 현재 태양은 {sun_direction} 하늘, 방위각 {solar.azimuth:.1f}°에 "
        f"있어요. 카메라는 {place.direction_label}을 바라보고 {light_action}"
    )
    if solar.lighting_issue == "수면 반사와 역광" and solar.lighting_risk == "높음":
        if concept.id == "sunset":
            return (
                f"{direction_guide} 바다 반사가 강한 방향이라 실루엣은 선명해져요. "
                "얼굴도 보이게 하려면 화면에서 얼굴을 누르고 밝기를 조금 올리세요."
            )
        return (
            f"{direction_guide} 바다 반사가 강하면 카메라가 밝은 배경에 맞춰 얼굴을 "
            "어둡게 만들 수 있어요. 촬영 위치를 태양에서 20~30° 옆으로 옮기세요."
        )
    if solar.lighting_issue == "수면 반사와 역광":
        return (
            f"{direction_guide} 수면의 반짝임이 일부 들어올 수 있으니 얼굴이 어두우면 "
            "카메라 방향을 조금 옆으로 틀어주세요."
        )
    if solar.lighting_issue == "나뭇잎 사이 얼룩 그림자":
        return (
            f"{direction_guide} 나뭇잎 틈의 직사광이 얼굴에 밝은 점과 어두운 점을 "
            "함께 만들 수 있어요. 한두 걸음 옆의 빛이 고른 그늘로 이동하세요."
        )
    if solar.lighting_issue in {"유리·노면 반사", "유리·젖은 노면 반사"}:
        return (
            f"{direction_guide} 유리나 노면의 반사가 렌즈를 향할 수 있어요. "
            "촬영 위치를 20° 정도 옆으로 옮기고 화면에서 얼굴을 눌러 밝기를 맞추세요."
        )
    if solar.lighting_issue == "강한 직사광과 건물 그림자":
        return (
            f"{direction_guide} 햇빛과 건물 그늘의 밝기 차가 커요. 그림자 경계는 피하고 "
            "건물 그늘 안쪽의 빛이 고른 자리를 고르세요."
        )
    if solar.lighting_issue == "강한 직사광":
        return (
            f"{direction_guide} 직사광이 강해 눈 밑과 턱 아래 그림자가 진해질 수 있어요. "
            "얼굴을 태양에서 살짝 돌리거나 옅은 그늘로 이동하세요."
        )
    if solar.lighting_issue == "자연광 부족":
        return (
            f"{direction_guide} 자연광이 약하니 야간 모드를 켜고 휴대폰을 두 손이나 "
            "고정 지지대로 흔들리지 않게 잡으세요."
        )
    return f"{direction_guide} 지금은 얼굴과 배경의 밝기 차가 비교적 안정적이에요."
