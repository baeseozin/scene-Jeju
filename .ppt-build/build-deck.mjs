import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const GRID = "/Users/baeseojin/Desktop/JBNU/scene-Jeju/.ppt-build/grid";
const { buildSlide01 } = await import(`${GRID}/slide-01.mjs`);
const { buildSlide06 } = await import(`${GRID}/slide-06.mjs`);
const { buildSlide10 } = await import(`${GRID}/slide-10.mjs`);
const { buildSlide15 } = await import(`${GRID}/slide-15.mjs`);
const { buildSlide16 } = await import(`${GRID}/slide-16.mjs`);
const { buildSlide17 } = await import(`${GRID}/slide-17.mjs`);
const { buildSlide18 } = await import(`${GRID}/slide-18.mjs`);
const { buildSlide19 } = await import(`${GRID}/slide-19.mjs`);
const { buildSlide26 } = await import(`${GRID}/slide-26.mjs`);

const OUT = "/Users/baeseojin/Desktop/JBNU/scene-Jeju/sceneJeju_상세_구현설명.pptx";
const RENDER_DIR = "/Users/baeseojin/Desktop/JBNU/scene-Jeju/.ppt-build/artifact-renders";
const FONT = "Apple SD Gothic Neo";
const INK = "#111716";
const MUTED = "#4E5E59";
const ACCENT = "#2D8C73";
const PALE = "#E8F3EF";

const KMA = "https://www.data.go.kr/data/15084084/openapi.do?recommendDataYn=Y";
const KMA_SKY = "https://www.data.go.kr/dataset/15000099/openapi.do?mypageFlag=Y";
const KAKAO_LOCAL = "https://developers.kakao.com/docs/ko/local/dev-guide";
const KAKAO_ROUTE = "https://developers.kakaomobility.com/affiliate-en/navi-api/directions.html";
const PVLIB_POS = "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.solarposition.get_solarposition.html";
const PVLIB_SOLIS = "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.clearsky.simplified_solis.html";
const MDN_STREAM = "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream";
const MDN_REC = "https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder";
const ROOT = "/Users/baeseojin/Desktop/JBNU/scene-Jeju";

function rich(text, size = 20, bold = false, color = INK, options = {}) {
  return {
    runs: [{ run: text, textStyle: { fontSize: `${size}px`, typeface: FONT, color, bold } }],
    paragraphStyle: { lineSpacingPercent: options.lineSpacingPercent ?? 108000 },
    spaceBefore: options.spaceBefore ?? 0,
    spaceAfter: options.spaceAfter ?? 0,
  };
}

function title(text) { return rich(text, 39, true); }
function coverTitle(text) { return rich(text, 76, true, INK, { lineSpacingPercent: 94000 }); }
function kicker(text) { return rich(text, 22, true, ACCENT); }
function subtitle(text) { return rich(text, 24, false, MUTED, { lineSpacingPercent: 118000 }); }
function section(head, body, size = 19) {
  return {
    titleHere: rich(head, 23, true, INK, { spaceAfter: 500 }),
    loremIpsumDolorSitAmetConsecteturAdipiscing: rich(body, size, false, MUTED, { lineSpacingPercent: 116000 }),
  };
}
function numbered(n) { return rich(String(n), 14, true, MUTED); }

function decorate(slide, page, accent = ACCENT) {
  slide.background.fill = "#FFFFFF";
  slide.shapes.add({
    geometry: "rect",
    name: `accent-line-${page}`,
    position: { left: 0, top: 0, width: 1280, height: 7 },
    fill: accent,
    line: { style: "solid", fill: "none", width: 0 },
  });
}

function addNotes(slide, body, sources) {
  slide.speakerNotes.textFrame.setText(
    `${body}\n\n[Sources]\n${sources.map((source) => `- ${source}`).join("\n")}`,
  );
  slide.speakerNotes.setVisible(true);
}

function addConceptBars(slide) {
  const bars = [
    [41.33, 218, "#62B9EF"], [350.13, 218, "#79B88A"],
    [657.68, 218, "#EF765F"], [966.48, 218, "#DFCFB4"],
    [41.33, 423, "#77879D"], [350.13, 423, "#70DEC7"],
  ];
  for (const [left, top, fill] of bars) {
    slide.shapes.add({
      geometry: "rect",
      position: { left, top, width: 104, height: 6 },
      fill,
      line: { style: "solid", fill: "none", width: 0 },
    });
  }
}

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

// 1 — Cover
{
  const slide = buildSlide01(deck, {
    title: kicker("MOOD MAKER · SCENE JEJU"),
    title2: coverTitle("도착할 때의 빛을\n촬영 결과로 바꾸는 방법"),
    title3: subtitle("React + FastAPI 기반 제주 촬영 적합도 서비스\n현재 코드 기준 상세 구현 설명"),
  });
  decorate(slide, 1);
  addNotes(slide,
    "이 자료는 서비스 소개보다 구현 원리를 설명하는 데 목적이 있습니다. 핵심 질문은 ‘사용자가 실제 장소에 도착할 때 어떤 빛과 날씨를 만나며, 그 조건을 어떻게 촬영 행동으로 바꾸는가’입니다.",
    [`${ROOT}/README.md`, `${ROOT}/backend/app/main.py`, `${ROOT}/frontend/src/App.tsx`]);
}

// 2 — Problem
{
  const slide = buildSlide10(deck, {
    footer1: numbered(2),
    title: title("현재 날씨가 아니라, 도착해서 찍을 순간을 판단한다"),
    body1: rich("기존 날씨 앱의 답", 23, true),
    body2: {
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("‘지금 맑다’는 정보만으로는 촬영 성공을 보장하지 못합니다.", 20, false, MUTED, { spaceAfter: 700 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing2: rich("이동 중 날씨와 빛의 방향이 바뀌고, 같은 조건도 해변·숲·도심에서 결과가 달라집니다.", 20, false, MUTED),
    },
    label1: rich("도착 시각 계산", 20, true),
    label2: rich("장소별 빛 위험", 20, true),
    label3: rich("컨셉별 허용 조건", 20, true),
    label4: rich("촬영 행동 안내", 20, true),
    label5: rich("결과물 편집", 20, true),
  });
  decorate(slide, 2);
  addNotes(slide,
    "문제 정의를 기능 목록으로 말하지 말고 의사결정 차이로 설명합니다. 서비스는 ‘갈까 말까’만 판단하지 않고, 언제 출발하고 어디에 서서 무엇을 조정해야 하는지까지 연결합니다.",
    [`${ROOT}/backend/app/main.py`, `${ROOT}/backend/app/data.py`, `${ROOT}/frontend/src/MediaStudio.tsx`]);
}

// 3 — End-to-end
{
  const slide = buildSlide18(deck, {
    footer1: numbered(3),
    title: title("한 번의 분석 요청이 세 층의 판단을 통과한다"),
    body1: section("① 여행 계획", "현재 위치·장소·출발 시각·이동수단·컨셉·사진/영상을 입력합니다."),
    body2: section("② 환경 분석", "도착 후 12시간까지 13개 시각을 만들고 날씨·태양·장소 위험을 계산합니다."),
    body3: section("③ 촬영 결과", "상태와 점수, 최적 시각, 쉬운 촬영 방향, 거리·노출 가이드를 반환합니다."),
    label1: rich("INPUT", 17, true, ACCENT),
    label2: rich("ANALYZE", 17, true, ACCENT),
    label3: rich("OUTPUT", 17, true, ACCENT),
  });
  decorate(slide, 3);
  addNotes(slide,
    "FastAPI의 POST /api/analyze가 전체 흐름을 조정합니다. 시간대별 날씨와 태양 결과를 zip으로 묶어 평가하고, 선택된 best_index의 데이터만 최종 결과의 weather·solar·scores·guide에 사용합니다. 따라서 화면의 점수와 설명이 서로 다른 시간대를 가리키는 오류를 막았습니다.",
    [`${ROOT}/backend/app/main.py:88`, `${ROOT}/backend/app/main.py:121`, `${ROOT}/backend/app/main.py:153`]);
}

// 4 — Architecture
{
  const slide = buildSlide06(deck, {
    footer1: numbered(4),
    title: title("프론트는 입력과 편집, 백엔드는 데이터 결합과 판단을 맡는다"),
    body1: section("React · TypeScript", "모바일 입력 UI\n카카오 지도 선택\n시간대·점수 시각화\n브라우저 내 편집·저장", 19),
    body2: section("FastAPI · Python", "요청 검증\n이동시간·예보 조회\npvlib 계산\n점수·가이드 생성", 19),
    body3: section("외부 데이터", "카카오 장소 검색\n카카오 자동차 경로\n기상청 초단기·단기예보\n실패 시 fallback", 19),
  });
  decorate(slide, 4);
  addNotes(slide,
    "React는 사용자 경험과 로컬 미디어 처리를 담당하고 FastAPI는 외부 API 키를 안전하게 사용하며 계산을 수행합니다. 카카오 JavaScript 키는 지도 표시용, REST 키는 장소 검색과 자동차 경로용이라 역할이 다릅니다.",
    [`${ROOT}/frontend/src/App.tsx`, `${ROOT}/frontend/src/api.ts`, `${ROOT}/backend/app/main.py`, KAKAO_LOCAL, KAKAO_ROUTE]);
}

// 5 — Place search
{
  const slide = buildSlide10(deck, {
    footer1: numbered(5),
    title: title("장소명 하나를 좌표와 촬영 환경 유형으로 확장한다"),
    body1: rich("검색 → 검증 → 유형 추론", 23, true),
    body2: {
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("입력어에 ‘제주’가 없으면 자동으로 붙이고, 정확도순 최대 10건을 요청한 뒤 제주 경계 안 결과만 최대 5건 사용합니다.", 19, false, MUTED, { spaceAfter: 650 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing2: rich("이름·카테고리 키워드로 beach / forest / indoor / urban 중 하나를 추론하며 사용자가 수정할 수 있습니다.", 19, false, MUTED),
    },
    label1: rich("키워드 검색", 19, true),
    label2: rich("좌표 선택", 19, true),
    label3: rich("제주 범위 검증", 19, true),
    label4: rich("장소 유형 추론", 19, true),
    label5: rich("수동 보정", 19, true),
  });
  decorate(slide, 5);
  addNotes(slide,
    "검색 API는 /api/places/search, 지도 역검색은 /api/places/reverse입니다. 역검색은 300m 안의 관광·문화·카페·숙박 카테고리를 병렬 조회하고 가장 가까운 장소를 선택하며, 없으면 주소를 사용합니다. 제주 유효 범위는 위도 33.05~33.65, 경도 125.95~127.05입니다.",
    [`${ROOT}/backend/app/services/place_search.py:10`, `${ROOT}/backend/app/services/place_search.py:44`, `${ROOT}/backend/app/services/place_search.py:77`, `${ROOT}/backend/app/services/place_search.py:105`, KAKAO_LOCAL]);
}

// 6 — Travel
{
  const slide = buildSlide17(deck, {
    footer1: numbered(6),
    title: title("출발 시각에 이동시간을 더해 분석 기준시각을 만든다"),
    label1: rich("자동차", 18, true, ACCENT),
    label2: rich("대중교통", 18, true, ACCENT),
    label3: rich("도보", 18, true, ACCENT),
    body1: section("카카오 경로 우선", "distance와 duration을 사용합니다. 실패하면 직선거리×1.23, 평균속도와 7분 여유를 적용합니다.", 18),
    body2: section("MVP 추정", "직선거리×1.28, 평균 27km/h에 정류장 이동·배차 대기 15분을 더합니다.", 18),
    body3: section("MVP 추정", "직선거리×1.16을 4.5km/h로 이동한다고 계산합니다.", 18),
  });
  decorate(slide, 6);
  addNotes(slide,
    "공통 출발점은 Haversine 직선거리입니다. 자동차만 카카오 실제 경로를 우선 사용합니다. 대중교통과 도보는 현재 코드상 추정치이며 화면에서도 실제 경로와 예상값을 구분합니다. arrival_time = departure_time + travel_minutes가 이후 모든 날씨·빛 계산의 출발점입니다.",
    [`${ROOT}/backend/app/services/travel.py:22`, `${ROOT}/backend/app/services/travel.py:46`, `${ROOT}/backend/app/services/travel.py:65`, `${ROOT}/backend/app/main.py:110`, KAKAO_ROUTE]);
}

// 7 — Weather
{
  const slide = buildSlide06(deck, {
    footer1: numbered(7),
    title: title("예보 범위에 따라 초단기와 단기 자료를 자동 선택한다"),
    body1: section("① 좌표 → 격자", "촬영 장소 위·경도를 기상청 Lambert 격자 nx, ny로 변환합니다."),
    body2: section("② 예보 조회", "가까운 시각은 초단기 RN1·WSD·SKY, 범위 밖은 단기 PCP·WSD·SKY를 사용합니다."),
    body3: section("③ 시각 매칭", "요청 시각보다 같거나 늦은 완전한 예보를 우선 선택하고 KST timezone을 유지합니다."),
  });
  decorate(slide, 7);
  addNotes(slide,
    "초단기예보는 최신 발표 시각의 반영 지연을 고려해 매시 45분 이후에만 현재 시각 자료를 사용합니다. 단기예보는 02·05·08·11·14·17·20·23시 발표 중 API 반영 여유 15분을 뺀 최신 발표를 선택합니다. RN1은 1시간 강수, PCP는 단기 강수량, WSD는 바람, SKY는 하늘상태입니다.",
    [`${ROOT}/backend/app/services/weather.py:17`, `${ROOT}/backend/app/services/weather.py:55`, `${ROOT}/backend/app/services/weather.py:67`, `${ROOT}/backend/app/services/weather.py:210`, KMA]);
}

// 8 — SKY states
{
  const slide = buildSlide10(deck, {
    footer1: numbered(8),
    title: title("구름 퍼센트를 만들지 않고 기상청 하늘상태를 그대로 쓴다"),
    body1: rich("SKY 코드의 실제 범위", 23, true),
    body2: {
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("1 → 맑음\n3 → 구름 많음\n4 → 흐림", 27, true, INK, { spaceAfter: 650 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing2: rich("현재 단기예보에는 미래 구름량 0~100%가 없으므로 임의 퍼센트는 표시하지 않습니다.", 19, false, MUTED),
    },
    label1: rich("화면도 3단계", 19, true),
    label2: rich("점수도 SKY 비교", 19, true),
    label3: rich("설명은 쉬운 문장", 19, true),
    label4: rich("가짜 정밀도 제거", 19, true),
    label5: rich("출처 명확화", 19, true),
  });
  decorate(slide, 8);
  addNotes(slide,
    "이 슬라이드는 정확성 관련 예상 질문에 답하는 장입니다. 2019년 6월 이후 하늘상태는 맑음·구름많음·흐림 3단계입니다. 서비스 내부에서는 SKY 단계로 맑은 하늘 기준 빛을 감쇠하지만, 사용자 화면에는 공식 상태값만 표시합니다.",
    [`${ROOT}/backend/app/services/weather.py:94`, `${ROOT}/frontend/src/App.tsx:515`, KMA_SKY]);
}

// 9 — Solar
{
  const slide = buildSlide10(deck, {
    footer1: numbered(9),
    title: title("pvlib가 시간·좌표를 빛의 위치와 세기로 바꾼다"),
    body1: rich("내부 계산 파이프라인", 23, true),
    body2: {
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("get_solarposition(KST 시각, 위도, 경도)\n→ apparent_elevation, azimuth", 20, true, INK, { spaceAfter: 700 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing2: rich("simplified_solis(태양 높이)\n→ 맑은 하늘 기준 GHI·DNI·DHI", 20, true, INK),
    },
    label1: rich("맑음 × 1.00", 18, true),
    label2: rich("구름 많음: GHI × 0.65", 18, true),
    label3: rich("구름 많음: DNI × 0.45", 18, true),
    label4: rich("흐림: GHI × 0.28", 18, true),
    label5: rich("흐림: DNI × 0.08", 18, true),
  });
  decorate(slide, 9);
  addNotes(slide,
    "태양 위치는 pvlib 공식 함수로 계산합니다. 일사량은 센서 실측이 아니라 simplified_solis의 맑은 하늘 추정값을 SKY 단계별 계수로 감쇠한 값입니다. GHI는 수평면 총 일사, DNI는 태양 직달 성분, DHI는 확산 성분으로 장소별 명암 위험과 컨셉 적합도를 계산하는 내부 지표입니다.",
    [`${ROOT}/backend/app/services/solar.py:12`, PVLIB_POS, PVLIB_SOLIS]);
}

// 10 — Lighting risks
{
  const slide = buildSlide16(deck, {
    footer1: numbered(10),
    title: title("같은 햇빛도 장소 표면에 따라 실패 형태가 달라진다"),
    body1: section("해변", "수면 반사·역광\n잔물결과 빛 정렬을 함께 계산"),
    body2: section("숲", "나뭇잎 틈 직사광\n얼굴의 얼룩 그림자 위험"),
    body3: section("도심", "유리·젖은 노면 반사\n건물 그늘의 밝기 차"),
    body4: section("실내", "창문 역광\n실내외 밝기 차"),
    body5: section("낮음", "위험 점수 25 미만\n빛 조건 안정"),
    body6: section("보통", "25 이상 60 미만\n현장 조정 필요"),
    body7: section("높음", "60 이상\n일반 컨셉 최대 ‘보통’"),
    body8: section("의도적 효과", "노을·반짝이는 컨셉은\n역광 감점을 예외 처리"),
  });
  decorate(slide, 10);
  addNotes(slide,
    "빛 위험은 실제 카메라 노출계나 3D 현장 측정이 아니라 장소 유형에서 흔한 실패를 미리 경고하는 휴리스틱입니다. 해변은 태양-촬영방향 정렬, 낮은 태양, 직달광, 바람의 잔물결을 반영합니다. 숲은 직달광과 전체광, 바람의 잎 흔들림을 반영합니다. 도심은 반사와 그늘 위험 중 큰 값을 사용합니다.",
    [`${ROOT}/backend/app/services/solar.py:48`, `${ROOT}/backend/app/services/solar.py:77`, `${ROOT}/backend/app/services/scoring.py:64`]);
}

// 11 — Concepts
{
  const slide = buildSlide16(deck, {
    footer1: numbered(11),
    title: title("6개 컨셉은 서로 다른 날씨·빛·장소 범위를 가진다"),
    body1: section("청량한", "맑음 · 강한 빛\n해변·도심\n순광 관계"),
    body2: section("자연스러운", "맑음/구름 많음\n중간 빛\n부드러운 옆빛"),
    body3: section("노을 실루엣", "일몰 전후\n낮은 빛\n역광 관계"),
    body4: section("포근한", "구름 많음/흐림\n확산광\n숲·도심·실내"),
    body5: section("무드있는", "구름 많음/흐림\n낮은 빛\n숲·도심"),
    body6: section("반짝이는", "맑음 · 강한 빛\n해변·도심\n반사광 관계"),
    body7: section("공통 필드", "허용 비·바람\n선호 SKY\n빛 범위·방향 오프셋"),
    body8: section("화면 테마", "스카이·그린·코럴\n베이지·블루그레이·민트"),
  });
  decorate(slide, 11);
  addConceptBars(slide);
  addNotes(slide,
    "Concept 데이터 클래스에는 최대 강수, 최대 바람, 선호 SKY, 최소·최대 태양 높이, 최소·최대 GHI, 태양과 촬영 방향의 목표 차이, 적합 장소 유형이 저장됩니다. 이 값들은 단순 라벨이 아니라 실제 점수 계산에 들어갑니다.",
    [`${ROOT}/backend/app/data.py:24`, `${ROOT}/backend/app/data.py:90`]);
}

// 12 — Weather score
{
  const slide = buildSlide19(deck, {
    footer1: numbered(12),
    title: title("날씨 점수는 비·바람·하늘의 가중합이다"),
    body1: {
      topic: rich("WEATHER SCORE", 20, true, ACCENT, { spaceAfter: 450 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("허용 범위 안은 높은 점수, 초과량이 커질수록 연속적으로 감점합니다. 하늘은 선택 컨셉의 preferred_skies와 일치하면 100, 아니면 42입니다.", 19, false, MUTED),
    },
    stat1: rich("45%", 58, true, ACCENT),
    stat2: rich("25%", 58, true, ACCENT),
    stat3: rich("30%", 58, true, ACCENT),
    body2: rich("비\n허용량 초과분 감점", 20, true),
    body3: rich("바람\n편안한 범위 이후 감점", 20, true),
    body4: rich("하늘\n컨셉 선호 상태 비교", 20, true),
  });
  decorate(slide, 12);
  addNotes(slide,
    "rain_score는 허용치 이하면 100, 초과하면 75 - excess×55입니다. wind_score는 최대 허용 바람의 65%까지 100이며 이후 최대 허용치의 85%를 감점 구간으로 사용합니다. weather_score = rain×0.45 + wind×0.25 + sky×0.30입니다. 실내는 비·바람·하늘 점수에 각각 최소값을 둡니다.",
    [`${ROOT}/backend/app/services/scoring.py:77`, `${ROOT}/backend/app/services/scoring.py:81`, `${ROOT}/backend/app/services/scoring.py:87`, `${ROOT}/backend/app/services/scoring.py:98`]);
}

// 13 — Light score
{
  const slide = buildSlide19(deck, {
    footer1: numbered(13),
    title: title("빛 점수는 장소 정보의 신뢰도에 따라 계산식을 바꾼다"),
    body1: {
      topic: rich("LIGHT SCORE", 20, true, ACCENT, { spaceAfter: 450 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("태양 높이와 예상 빛의 양은 컨셉 권장 범위 안에서 100점입니다. 밖으로 벗어날수록 거리에 비례해 감점하고, 장소 유형별 빛 위험도 추가 반영합니다.", 19, false, MUTED),
    },
    stat1: rich("40·32·28", 47, true, ACCENT),
    stat2: rich("45·40·15", 47, true, ACCENT),
    stat3: rich("35·30·+35", 47, true, ACCENT),
    body2: rich("등록 장소\n높이·빛의 양·방향", 19, true),
    body3: rich("검색 장소\n방향은 중립값 75", 19, true),
    body4: rich("실내\n방향 대신 창가 가정", 19, true),
  });
  decorate(slide, 13);
  addNotes(slide,
    "등록 장소는 촬영 권장 방향을 알고 있어 방향 점수를 계산합니다. 사용자 검색 장소는 현장 구조를 모르므로 방향 만점을 주지 않고 75로 고정합니다. 실내는 태양 방향을 직접 평가하지 않고 창가 배치를 전제로 방향 100과 상수 35를 사용합니다. 장소 점수는 컨셉×장소 유형 행렬로 별도 계산합니다.",
    [`${ROOT}/backend/app/services/scoring.py:35`, `${ROOT}/backend/app/services/scoring.py:46`, `${ROOT}/backend/app/services/scoring.py:108`, `${ROOT}/backend/app/services/scoring.py:124`]);
}

// 14 — Total and caps
{
  const slide = buildSlide18(deck, {
    footer1: numbered(14),
    title: title("가중평균 뒤에 안전장치를 적용해 ‘좋은 평균’의 착시를 막는다"),
    body1: section("총점", "날씨 40% + 빛 45% + 장소 15%\n0~100으로 반올림·제한"),
    body2: section("상태", "75 이상 가능\n50~74 보통\n49 이하 비추천"),
    body3: section("상한·강제 비추천", "해진 뒤, 심한 비·바람, 컨셉 핵심 시간에서 크게 벗어나면 총점 상한을 적용"),
    label1: rich("WEIGHT", 17, true, ACCENT),
    label2: rich("STATUS", 17, true, ACCENT),
    label3: rich("GUARDRAIL", 17, true, ACCENT),
  });
  decorate(slide, 14);
  addNotes(slide,
    "이 부분이 ‘비추천이 모두 49점’ 문제를 고친 핵심입니다. 강제 비추천의 점수 상한은 밤의 깊이, 심한 비·바람 초과량, 컨셉 높이 범위 이탈량에 따라 10~49 사이에서 달라집니다. 약한 위반은 최대 보통으로 제한하고, 치명적 위반은 강제 비추천합니다. 실내에는 야외 강제 규칙을 적용하지 않습니다.",
    [`${ROOT}/backend/app/services/scoring.py:151`, `${ROOT}/backend/app/services/scoring.py:154`, `${ROOT}/backend/app/services/scoring.py:166`, `${ROOT}/backend/app/services/scoring.py:210`]);
}

// 15 — 13 slots
{
  const slide = buildSlide17(deck, {
    footer1: numbered(15),
    title: title("도착 직후부터 12시간 뒤까지 13개 후보를 같은 방식으로 평가한다"),
    label1: rich("13개 시각", 18, true, ACCENT),
    label2: rich("13개 평가", 18, true, ACCENT),
    label3: rich("1개 추천", 18, true, ACCENT),
    body1: section("도착 + 0~12시간", "1시간 간격 target_times를 생성해 모든 컨셉이 저녁까지 비교됩니다.", 18),
    body2: section("날씨·빛·점수", "각 시각마다 같은 파이프라인을 실행해 status와 total을 만듭니다.", 18),
    body3: section("상태 > 점수 > 빠른 시각", "가능을 먼저, 같은 상태면 높은 점수, 동점이면 더 빠른 시각을 선택합니다.", 18),
  });
  decorate(slide, 15);
  addNotes(slide,
    "select_best_index는 문자열 상태를 직접 비교하지 않고 가능=2, 보통=1, 비추천=0 우선순위를 둡니다. max의 key는 (상태 우선순위, 총점, -index)입니다. 따라서 74점 보통보다 75점 가능이 우선하고, 동일 조건이면 사용자를 오래 기다리게 하지 않습니다.",
    [`${ROOT}/backend/app/main.py:121`, `${ROOT}/backend/app/services/scoring.py:16`]);
}

// 16 — Guide generator
{
  const slide = buildSlide16(deck, {
    footer1: numbered(16),
    title: title("분석값은 네 단계의 현장 행동으로 다시 조립된다"),
    body1: section("1. 거리", "인물↔주요 배경\n촬영자↔인물\n스마트폰 1× 기준"),
    body2: section("2. 위치", "장소를 뒤에 두는 법\n빛을 받는 방향\n현장 이동 문장"),
    body3: section("3. 하늘·바람", "기상청 SKY 설명\n흔들림·머리카락\n컨셉 동작"),
    body4: section("4. 결과", "빛·비 설명\n마무리 동작\n예상 노출 실패"),
    body5: section("사진 모드", "전신·허리 위·배경 중심\n연속 촬영 선택"),
    body6: section("영상 모드", "4개 짧은 장면\n시간·카메라 이동"),
    body7: section("예시 장소", "장소×컨셉 전용 템플릿\n없으면 유형 템플릿"),
    body8: section("쉬운 언어", "‘전경’ 대신 앞/뒤\n각도 대신 몇 걸음"),
  });
  decorate(slide, 16);
  addNotes(slide,
    "guide_for는 사진이면 photo_guide, 영상이면 장소×컨셉 전용 GUIDES를 우선 사용하고 없으면 custom_place_guide로 대체합니다. 실제 날씨와 태양 결과가 있으면 distance_setup_guide, shooting_direction_guide, sky_and_wind_explanation, solar_height_explanation, rain_explanation, expected_result_guide를 네 문장에 합칩니다.",
    [`${ROOT}/backend/app/data.py:259`, `${ROOT}/backend/app/data.py:283`, `${ROOT}/backend/app/data.py:306`, `${ROOT}/backend/app/data.py:340`, `${ROOT}/backend/app/data.py:384`]);
}

// 17 — Human language
{
  const slide = buildSlide10(deck, {
    footer1: numbered(17),
    title: title("전문 수치는 계산에 남기고, 화면에는 촬영 행동만 보여준다"),
    body1: rich("내부 모델은 정밀하게", 23, true),
    body2: {
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("elevation · azimuth\nGHI · DNI · DHI\nwind_speed_mps\nlighting_risk_score", 21, true, INK, { spaceAfter: 650 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing2: rich("API 응답과 점수 계산에는 유지하지만 일반 사용자 카드에는 직접 노출하지 않습니다.", 19, false, MUTED),
    },
    label1: rich("‘산들바람이 불어요’", 18, true),
    label2: rich("‘빛이 충분해요’", 18, true),
    label3: rich("‘두세 걸음 옆으로’", 18, true),
    label4: rich("‘얼굴이 어두워질 수 있어요’", 18, true),
    label5: rich("‘맑음 / 구름 많음 / 흐림’", 18, true),
  });
  decorate(slide, 17);
  addNotes(slide,
    "표현 계층을 분리했습니다. backend의 평가 모델은 수치를 유지하고, 가이드 함수와 frontend의 getWindLabel·getLightLabel·getLightAdvice가 행동 문장으로 바꿉니다. 하늘상태는 기상청 값을 그대로 사용하며 임의 구름 퍼센트는 만들지 않습니다.",
    [`${ROOT}/backend/app/models.py:93`, `${ROOT}/backend/app/data.py:414`, `${ROOT}/frontend/src/App.tsx:90`, `${ROOT}/frontend/src/App.tsx:101`]);
}

// 18 — Frontend
{
  const slide = buildSlide15(deck, {
    footer1: numbered(18),
    title: title("모바일 UI는 입력·분석·재사용의 한 흐름으로 구성된다"),
    body1: {
      titleHere: rich("React 상태 흐름", 24, true, INK, { spaceAfter: 550 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("폼 상태 → analyze() → Analysis 응답 → 결과 섹션 렌더링", 20, false, MUTED, { spaceAfter: 700 }),
      quamUtMassaLuctusCursusNullamPharetra: rich("분석 완료 후 결과 위치로 부드럽게 이동하고, 모든 컨셉 카드는 모바일에서 2열로 표시합니다.", 19, false, MUTED),
    },
    label1: rich("입력", 18, true, ACCENT), body2: rich("장소·컨셉·출발·이동수단", 18),
    label2: rich("결과", 18, true, ACCENT), body3: rich("13시간대·점수·이유·가이드", 18),
    label3: rich("테마", 18, true, ACCENT), body4: rich("6개 컨셉별 배경·강조색", 18),
    label4: rich("재사용", 18, true, ACCENT), body5: rich("localStorage 최대 10개·PNG 공유", 18),
  });
  decorate(slide, 18);
  addNotes(slide,
    "Analysis 타입 하나가 결과 페이지의 단일 데이터 원천입니다. 선택된 컨셉의 accent는 분석 버튼과 결과 테마에 반영됩니다. 저장은 서버 DB가 아니라 localStorage이며, 공유는 Canvas로 결과 카드를 만든 뒤 Web Share API를 우선 사용하고 미지원 환경은 다운로드로 전환합니다.",
    [`${ROOT}/frontend/src/App.tsx`, `${ROOT}/frontend/src/types.ts`, `${ROOT}/frontend/src/share.ts`, `${ROOT}/frontend/src/styles.css`]);
}

// 19 — Editor
{
  const slide = buildSlide18(deck, {
    footer1: numbered(19),
    title: title("영상 편집은 서버 업로드 없이 브라우저 안에서 직접 렌더링한다"),
    body1: section("편집 모델", "최대 4개 클립\n구간·순서·속도·음소거\n필터·밝기·확대·위치"),
    body2: section("프레임 렌더", "360×640 Canvas\n30fps captureStream\n자막·컷/페이드 적용"),
    body3: section("인코딩·저장", "MediaRecorder\n지원 시 MP4, 그 외 WebM\n편집 길이 최대 15초"),
    label1: rich("EDIT", 17, true, ACCENT),
    label2: rich("RENDER", 17, true, ACCENT),
    label3: rich("EXPORT", 17, true, ACCENT),
  });
  decorate(slide, 19);
  addNotes(slide,
    "renderMontage는 각 클립의 trimEnd-trimStart를 speed로 나눈 편집 길이를 합치고 15초에서 자릅니다. requestAnimationFrame마다 crop·zoom·position·CSS Canvas filter·fade·caption을 적용합니다. Canvas 스트림과 AudioContext 목적지 스트림을 합쳐 MediaRecorder로 기록합니다. 사진은 별도 1080×1920 Canvas 콜라주로 저장합니다.",
    [`${ROOT}/frontend/src/MediaStudio.tsx:44`, `${ROOT}/frontend/src/MediaStudio.tsx:169`, `${ROOT}/frontend/src/MediaStudio.tsx:306`, MDN_STREAM, MDN_REC]);
}

// 20 — API and files
{
  const slide = buildSlide15(deck, {
    footer1: numbered(20),
    title: title("API 네 개와 역할별 파일 분리로 MVP를 추적 가능하게 만들었다"),
    body1: {
      titleHere: rich("FastAPI 엔드포인트", 24, true, INK, { spaceAfter: 550 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("GET /api/health\nGET /api/catalog\nGET /api/places/search\nGET /api/places/reverse\nPOST /api/analyze", 20, true, INK, { spaceAfter: 650 }),
      quamUtMassaLuctusCursusNullamPharetra: rich("Pydantic이 좌표 범위, 장소 입력 방식, timezone 포함 출발 시각을 검증합니다.", 18, false, MUTED),
    },
    label1: rich("데이터", 18, true, ACCENT), body2: rich("data.py · models.py", 18),
    label2: rich("서비스", 18, true, ACCENT), body3: rich("weather · solar · travel · scoring", 18),
    label3: rich("프론트", 18, true, ACCENT), body4: rich("App · api · types · styles", 18),
    label4: rich("미디어", 18, true, ACCENT), body5: rich("MediaStudio · share", 18),
  });
  decorate(slide, 20);
  addNotes(slide,
    "AnalyzeRequest는 place_id 또는 place 중 정확히 하나를 요구합니다. 사용자 입력 장소는 제주 범위로 제한됩니다. departure_time에는 UTC offset이 필수이며 서버에서는 Asia/Seoul로 변환합니다. API와 계산 서비스가 분리되어 있어 mock·real 교체와 단위 테스트가 쉽습니다.",
    [`${ROOT}/backend/app/models.py`, `${ROOT}/backend/app/main.py`, `${ROOT}/frontend/src/api.ts`]);
}

// 21 — Reliability and limits
{
  const slide = buildSlide10(deck, {
    footer1: numbered(21),
    title: title("데모는 끊기지 않게, 결과 해석은 과장하지 않게 설계했다"),
    body1: rich("신뢰성과 검증", 23, true),
    body2: {
      loremIpsumDolorSitAmetConsecteturAdipiscing: rich("mock: 외부 키 없이 결정론적 데모\nauto: 실제 데이터 우선, 실패 시 fallback\nreal: 실제 예보 실패를 오류로 반환", 19, true, INK, { spaceAfter: 700 }),
      loremIpsumDolorSitAmetConsecteturAdipiscing2: rich("백엔드 자동 테스트 26개와 프론트 TypeScript/Vite 빌드로 핵심 흐름을 확인합니다.", 19, false, MUTED),
    },
    label1: rich("빛의 양은 추정값", 18, true),
    label2: rich("현장 구조는 3D 측정 아님", 18, true),
    label3: rich("거리값은 촬영 시작 기준", 18, true),
    label4: rich("버스·도보는 현재 추정", 18, true),
    label5: rich("구름은 공식 3단계만", 18, true),
  });
  decorate(slide, 21);
  addNotes(slide,
    "auto 모드는 해커톤 시연 안정성을 위한 선택입니다. 실제 날씨와 자동차 경로가 실패하면 경고와 함께 fallback 출처를 화면에 남깁니다. 한계는 발표에서 먼저 밝히는 편이 좋습니다. 특히 빛 위험은 장소 유형 휴리스틱, 촬영 거리는 스마트폰 1× 기준 시작점, 대중교통·도보는 추정입니다.",
    [`${ROOT}/backend/app/config.py`, `${ROOT}/backend/app/services/weather.py:296`, `${ROOT}/backend/app/services/travel.py:93`, `${ROOT}/backend/tests/test_api.py`, `${ROOT}/backend/tests/test_core.py`, KMA]);
}

// 22 — Close
{
  const slide = buildSlide26(deck, {
    title: kicker("TAKEAWAY"),
    title2: coverTitle("데이터가 타이밍을 준비하고,\n사용자가 장면을 완성한다"),
    title3: {
      loremIpsumDetails: rich("도착 시각 기반", 22, true, ACCENT, { spaceAfter: 500 }),
      loremIpsumDetails2: rich("설명 가능한 점수", 22, true, ACCENT, { spaceAfter: 500 }),
      loremIpsumDetails3: rich("행동으로 이어지는 가이드", 22, true, ACCENT),
    },
  });
  decorate(slide, 22);
  addNotes(slide,
    "마지막에는 기술 스택보다 서비스의 연결 구조를 다시 강조합니다. sceneJeju의 차별점은 예보 자체가 아니라, 이동시간을 포함한 미래 조건을 설명 가능한 점수로 비교하고 현장에서 실행할 촬영 행동과 결과물 편집까지 연결한 데 있습니다.",
    [`${ROOT}/backend/app/main.py`, `${ROOT}/backend/app/services/scoring.py`, `${ROOT}/backend/app/data.py`, `${ROOT}/frontend/src/MediaStudio.tsx`]);
}

await fs.mkdir(RENDER_DIR, { recursive: true });
for (const [index, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(`${RENDER_DIR}/${stem}.png`, new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(`${RENDER_DIR}/${stem}.layout.json`, await layout.text());
}
const montage = await deck.export({ format: "webp", montage: true, scale: 1 });
await fs.writeFile(`${RENDER_DIR}/montage.webp`, new Uint8Array(await montage.arrayBuffer()));
const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(OUT);
console.log(OUT);
