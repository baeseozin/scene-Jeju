import json
import re
from typing import Any

import httpx

from ..config import Settings
from ..data import Concept
from ..models import (
    CaptureMode,
    FramingMode,
    PoseRecommendationItem,
    PoseRecommendationResponse,
)


GEMINI_GENERATE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent"
)

PLACE_LABELS = {
    "beach": "해변",
    "forest": "숲",
    "urban": "도심",
    "indoor": "실내",
}

FALLBACK_POSES: dict[str, list[dict[str, str]]] = {
    "refreshing": [
        {"id":"refresh-open","guide_type":"open","name":"바람 맞는 오픈 포즈","one_line":"가슴을 열고 팔을 몸에서 살짝 떼어 시원한 여백을 만들어요.","body":"한쪽 다리에 체중을 싣고 반대쪽 무릎은 가볍게 풀어주세요.","hands":"두 손은 허벅지에서 손바닥 한 뼘 정도 떨어뜨려 자연스럽게 펴요.","gaze":"카메라보다 조금 위나 먼 배경을 봐주세요.","camera":"촬영자는 인물에서 3~4m 떨어져 전신과 배경이 함께 들어오게 찍어요.","why":"열린 팔과 긴 몸선이 청량한 컨셉의 가벼움과 넓은 제주 풍경을 살려줘요."},
        {"id":"refresh-step","guide_type":"walk","name":"한 걸음 앞으로","one_line":"카메라를 향해 천천히 한 걸음 내딛는 순간을 찍어요.","body":"앞발을 내딛고 뒤꿈치가 바닥에서 막 떨어지는 순간을 유지해요.","hands":"팔은 걷는 방향과 반대로 작게 흔들어주세요.","gaze":"시선은 진행 방향보다 살짝 옆으로 두면 덜 어색해요.","camera":"촬영자는 4m 정도 앞에서 허리 높이로 두고 연속 촬영해요.","why":"작은 움직임이 사진에는 생동감을, 영상에는 자연스러운 시작 장면을 만들어줘요."},
        {"id":"refresh-side","guide_type":"side","name":"하늘 보는 옆모습","one_line":"몸을 비스듬히 돌리고 턱을 조금 들어 하늘 쪽을 봐요.","body":"어깨를 카메라에서 약 45도 돌리고 허리는 곧게 세워요.","hands":"한 손은 옷자락이나 가방끈을 가볍게 잡아주세요.","gaze":"빛을 직접 보지 말고 하늘 아래 먼 지점을 봐주세요.","camera":"촬영자는 인물에서 2.5~3m 떨어져 허리 위와 하늘을 넉넉히 담아요.","why":"옆얼굴과 하늘 여백이 파란색·밝은 빛 중심의 청량한 분위기를 강조해요."}
    ],
    "natural": [
        {"id":"natural-walk","guide_type":"walk","name":"길을 따라 걷기","one_line":"정면을 의식하지 말고 길을 따라 천천히 걸어요.","body":"보폭을 평소보다 조금 줄이고 상체 힘을 빼주세요.","hands":"한 손은 자연스럽게 흔들고 다른 손은 가방끈을 잡아도 좋아요.","gaze":"두세 걸음 앞의 바닥이나 나무를 바라봐요.","camera":"촬영자는 4~5m 뒤나 앞에서 길의 선이 함께 보이게 연속 촬영해요.","why":"걷는 동작은 연출한 티를 줄이고 자연스러운 컨셉의 편안함을 살려줘요."},
        {"id":"natural-touch","guide_type":"soft","name":"주변을 살짝 만지기","one_line":"나뭇잎이나 난간 가까이에 서서 손끝만 가볍게 가져가요.","body":"주요 배경에서 약 1m 앞에 서고 어깨를 편하게 내려요.","hands":"손가락에 힘을 주지 말고 손끝만 주변 요소에 닿게 해요.","gaze":"손끝이나 주변 풍경을 바라봐요.","camera":"촬영자는 2~3m 떨어져 허리 위 구도로 인물과 주변 질감을 같이 담아요.","why":"주변 환경과 작은 상호작용을 넣으면 포즈보다 여행 장면처럼 보여요."},
        {"id":"natural-turn","guide_type":"side","name":"걷다 돌아보기","one_line":"두 걸음 걷고 몸은 그대로 둔 채 얼굴만 카메라 쪽으로 돌려요.","body":"한 발을 앞에 둔 상태에서 상체는 진행 방향을 유지해요.","hands":"팔은 걷던 흐름대로 두고 일부러 모으지 않아요.","gaze":"눈만 카메라를 짧게 바라봐요.","camera":"촬영자는 4m 뒤에서 연속 촬영해 돌아보는 순간을 골라요.","why":"움직임 중 짧게 생기는 시선이 꾸미지 않은 자연스러운 표정을 만들어요."}
    ],
    "sunset": [
        {"id":"sunset-profile","guide_type":"side","name":"해질녘 옆모습","one_line":"몸을 옆으로 돌리고 얼굴 윤곽이 하늘과 겹치지 않게 서요.","body":"두 발을 앞뒤로 조금 벌리고 몸을 길게 세워주세요.","hands":"한 손은 허리 아래에 두고 다른 손은 머리카락 가까이에 둬요.","gaze":"해가 아니라 해 옆의 밝은 하늘을 바라봐요.","camera":"촬영자는 3~4m 떨어져 인물 뒤에 밝은 하늘이 오도록 위치를 옮겨요.","why":"옆얼굴 윤곽과 낮은 역광이 해질녘 하늘의 선과 색을 분명하게 만들어요."},
        {"id":"sunset-still","guide_type":"soft","name":"두 손 모은 정지 포즈","one_line":"두 손을 배 앞에 가볍게 모으고 움직임을 줄여요.","body":"어깨를 내리고 턱을 조금 당겨 실루엣을 단정하게 만들어요.","hands":"손가락을 겹치지 말고 한 손을 다른 손 위에 가볍게 얹어요.","gaze":"먼 수평선이나 건물 끝을 봐주세요.","camera":"촬영자는 3m 정도 떨어져 인물을 화면 한쪽에 두고 노을을 넓게 담아요.","why":"작은 포즈는 어두운 인물 형태를 깨끗하게 유지해 노을색이 더 잘 보이게 해요."},
        {"id":"sunset-step","guide_type":"walk","name":"노을 속 천천히 걷기","one_line":"노을을 옆에 두고 화면을 가로질러 천천히 걸어요.","body":"보폭을 넓히지 말고 발이 겹치지 않는 순간을 만들어요.","hands":"팔은 작게 흔들어 윤곽이 몸통과 붙지 않게 해요.","gaze":"걷는 방향의 먼 곳을 바라봐요.","camera":"촬영자는 4~5m 옆에서 연속 촬영하거나 3초 짧은 영상으로 담아요.","why":"가로 움직임이 노을의 수평선과 어울리고 영상에서는 자연스러운 실루엣 변화를 만들어요."}
    ],
    "film": [
        {"id":"film-bag","guide_type":"side","name":"가방끈 잡고 불빛 옆보기","one_line":"몸을 비스듬히 두고 가방끈을 잡은 채 따뜻한 불빛 옆을 바라봐요.","body":"한쪽 어깨를 카메라 쪽으로 보내고 두 발은 자연스럽게 앞뒤로 둬요.","hands":"한 손은 가방끈을 잡고 다른 손은 옷자락 가까이에 편하게 내려요.","gaze":"렌즈가 아니라 가로등이나 상점 불빛 옆의 먼 곳을 바라봐요.","camera":"촬영자는 3m 떨어져 인물을 화면 한쪽에 두고 골목이나 하늘의 빈 공간을 넓게 담아요.","why":"비어 있는 공간과 엇나간 시선이 일본 감성 영화 스틸컷 같은 여운을 만들어요."},
        {"id":"film-walkaway","guide_type":"walk","name":"먼저 걷고 살짝 돌아보기","one_line":"카메라보다 먼저 두 걸음 걷다가 얼굴만 아주 조금 옆으로 돌려요.","body":"등은 카메라 쪽에 두고 한 발이 앞으로 나온 순간에 잠깐 멈춰요.","hands":"팔은 자연스럽게 내리고 가방이나 얇은 겉옷을 한 손으로 잡아요.","gaze":"카메라를 직접 보지 말고 어깨 너머의 먼 곳을 바라봐요.","camera":"촬영자는 4~5m 뒤에서 인물을 작게 두고 길과 주변 불빛을 함께 찍어요.","why":"반쯤 보이는 옆얼굴과 긴 배경이 영화 속 이동 장면 같은 서사를 만들어줘요."},
        {"id":"film-window","guide_type":"soft","name":"창가에 기대어 아래 보기","one_line":"창문이나 난간 옆에서 어깨 힘을 빼고 시선을 살짝 내려요.","body":"상체는 세운 채 한쪽 어깨만 벽이나 난간 가까이에 둬요.","hands":"두 손은 느슨하게 모으거나 작은 소품을 가슴 아래에 들어요.","gaze":"발 앞이나 창밖 아래쪽을 조용히 바라봐요.","camera":"촬영자는 2.5~3m 떨어져 허리 위 인물과 푸른 그림자, 따뜻한 빛을 같이 담아요.","why":"차가운 배경과 따뜻한 옆빛의 색 차이가 일본 청춘영화 같은 조용한 분위기를 살려줘요."}
    ],
    "sparkling": [
        {"id":"sparkle-open","guide_type":"open","name":"빛을 받는 오픈 포즈","one_line":"팔을 몸에서 떼고 얼굴을 밝은 쪽으로 살짝 돌려요.","body":"가슴을 열고 한쪽 발을 옆으로 반 걸음 벌려요.","hands":"손가락을 펴서 팔과 몸 사이에 빛이 들어올 공간을 만들어요.","gaze":"빛을 직접 보지 말고 밝은 방향 옆을 바라봐요.","camera":"촬영자는 3m 떨어져 빛나는 배경과 전신을 함께 담아요.","why":"팔과 몸 사이의 여백에 빛이 들어오면 반짝이는 컨셉의 강조점이 선명해져요."},
        {"id":"sparkle-turn","guide_type":"walk","name":"한 바퀴 도는 순간","one_line":"제자리에서 천천히 돌다가 옷자락이 움직이는 순간을 찍어요.","body":"발을 작게 옮기고 상체는 너무 빨리 돌리지 않아요.","hands":"팔은 옷에서 조금 떨어뜨려 회전선을 보여줘요.","gaze":"돌아오는 순간 카메라를 짧게 바라봐요.","camera":"촬영자는 4m 떨어져 연속 촬영하거나 2~3초 영상으로 담아요.","why":"움직이는 옷과 머리카락에 빛이 걸리면 반짝이는 느낌이 가장 잘 드러나요."},
        {"id":"sparkle-profile","guide_type":"side","name":"빛 가장자리 옆모습","one_line":"몸을 옆으로 두고 얼굴 가장자리에 빛이 닿도록 위치를 바꿔요.","body":"몸을 45도 돌리고 턱을 살짝 들어 목선을 길게 만들어요.","hands":"한 손은 머리카락 끝이나 귀 옆에 가볍게 둬요.","gaze":"카메라보다 조금 위를 바라봐요.","camera":"촬영자는 2.5~3m 떨어져 허리 위 구도로 밝은 테두리가 보이는 위치를 찾아요.","why":"얼굴과 머리카락 가장자리의 빛이 아쿠아·민트 계열 반짝임을 강조해줘요."}
    ],
}


UPPER_BODY_ACTIONS = {
    "open": {
        "body": "허리 위가 보이도록 상체를 세우고 한쪽 어깨를 카메라 쪽으로 살짝 돌려주세요.",
        "hands": "팔꿈치를 몸에서 조금 떼고 두 손은 허리 옆이나 가슴 아래에서 보이게 둬요.",
    },
    "walk": {
        "body": "걷는 느낌만 나도록 상체를 살짝 앞으로 두고 어깨 힘은 편하게 빼주세요.",
        "hands": "한 손은 가방끈이나 옷깃에 두고 다른 손은 허리 높이에서 자연스럽게 보여주세요.",
    },
    "side": {
        "body": "상체를 카메라에서 약 45도 돌리고 목과 어깨가 겹치지 않게 세워주세요.",
        "hands": "한 손은 머리카락이나 귀 옆에, 다른 손은 허리 가까이에 가볍게 둬요.",
    },
    "soft": {
        "body": "어깨를 내리고 상체를 카메라 쪽으로 아주 조금 기울여 편안한 선을 만들어요.",
        "hands": "두 손은 가슴 아래나 허리 앞에서 느슨하게 모아 화면 안에 보이게 해요.",
    },
}


def _fallback(
    concept: Concept,
    capture_mode: CaptureMode,
    framing: FramingMode,
) -> PoseRecommendationResponse:
    raw_poses = FALLBACK_POSES.get(concept.id, FALLBACK_POSES["refreshing"])
    poses = [PoseRecommendationItem.model_validate(item) for item in raw_poses]
    if framing == "upper_body":
        distance = "1.8~2.3m" if capture_mode == "video" else "1.3~1.8m"
        poses = [
            pose.model_copy(
                update={
                    **UPPER_BODY_ACTIONS[pose.guide_type],
                    "camera": (
                        f"촬영자는 인물에서 {distance} 떨어져 머리 위에 손바닥 반 뼘의 여백을 두고 "
                        "머리부터 허리까지 담아요. 손이 화면 밖으로 잘리지 않는지 확인해요."
                    ),
                }
            )
            for pose in poses
        ]
    return PoseRecommendationResponse(
        source="fallback",
        framing=framing,
        basis=(
            f"{concept.name} 컨셉과 {'상반신' if framing == 'upper_body' else '전신'} 구도를 "
            "반영한 검증 가능한 기본 포즈 라이브러리"
        ),
        poses=poses,
    )


def _slug(value: str, index: int) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")
    return slug[:32] or f"pose-{index + 1}"


def _extract_output_text(payload: dict[str, Any]) -> str:
    for candidate in payload.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if part.get("text"):
                return str(part["text"])
    raise ValueError("Gemini 응답에서 추천 JSON을 찾지 못했습니다.")


async def recommend_poses(
    concept: Concept,
    place_type: str,
    capture_mode: CaptureMode,
    framing: FramingMode,
    settings: Settings,
) -> PoseRecommendationResponse:
    fallback = _fallback(concept, capture_mode, framing)
    if not settings.use_gemini_pose_recommendation:
        return fallback

    schema = {
        "type": "object",
        "properties": {
            "basis": {"type": "string"},
            "poses": {
                "type": "array",
                "minItems": 3,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "guide_type": {"type": "string", "enum": ["open", "walk", "side", "soft"]},
                        "name": {"type": "string"},
                        "one_line": {"type": "string"},
                        "body": {"type": "string"},
                        "hands": {"type": "string"},
                        "gaze": {"type": "string"},
                        "camera": {"type": "string"},
                        "why": {"type": "string"}
                    },
                    "required": ["guide_type", "name", "one_line", "body", "hands", "gaze", "camera", "why"]
                }
            }
        },
        "required": ["basis", "poses"]
    }
    prompt = (
        "제주 여행 촬영 서비스의 포즈 디렉터다. 현재 사람의 자세를 분석하거나 점수를 매기지 말고, "
        "사용자가 선택한 컨셉에 어울리는 서로 다른 포즈 3개를 추천하라. 컨셉을 최우선으로 반영하고 "
        "장소 유형과 사진/영상 여부는 보조 조건으로만 사용한다. 전문 촬영 용어 없이 한국어로 쓰고, "
        "신체 비율·외모를 평가하지 말라. 사용자가 바로 따라 할 수 있도록 몸, 손, 시선, 촬영자 거리를 구체적으로 설명하라. "
        "전신 구도라면 발끝이 잘리지 않는 거리와 발·다리 동작을 포함하고, 상반신 구도라면 머리부터 허리까지 담으며 "
        "손이 화면 밖으로 잘리지 않도록 상체·손 중심으로 설명하라.\n\n"
        f"컨셉: {concept.name} — {concept.description}\n"
        f"장소 유형: {PLACE_LABELS.get(place_type, place_type)}\n"
        f"촬영 결과: {'15초 영상' if capture_mode == 'video' else '사진'}\n"
        f"촬영 구도: {'상반신(머리부터 허리)' if framing == 'upper_body' else '전신(머리부터 발끝)'}"
    )
    request_body = {
        "contents": [
            {"role": "user", "parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": schema,
            "maxOutputTokens": 1200,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=18.0) as client:
            response = await client.post(
                GEMINI_GENERATE_URL.format(model=settings.gemini_pose_model),
                headers={
                    "x-goog-api-key": settings.gemini_api_key,
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            response.raise_for_status()
        decoded = json.loads(_extract_output_text(response.json()))
        poses = [
            PoseRecommendationItem(id=_slug(item["name"], index), **item)
            for index, item in enumerate(decoded["poses"])
        ]
        return PoseRecommendationResponse(
            source="gemini",
            model=settings.gemini_pose_model,
            framing=framing,
            basis=decoded["basis"],
            poses=poses,
        )
    except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return fallback
