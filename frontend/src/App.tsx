import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { analyze, getCatalog, reversePlace, searchPlaces } from "./api";
import KakaoMapPicker from "./KakaoMapPicker";
import MediaStudio from "./MediaStudio";
import { createAnalysisCard } from "./share";
import type {
  Analysis,
  CaptureMode,
  Catalog,
  Place,
  PlaceSearchResult,
  SavedAnalysis,
  Status,
  TransportMode,
} from "./types";

const STATUS_META: Record<Status, { shortLabel: string; label: string; eyebrow: string; color: string }> = {
  가능: { shortLabel: "좋음", label: "지금 찍기 좋아요", eyebrow: "좋음 · GREAT TO SHOOT", color: "#1f8f72" },
  보통: { shortLabel: "괜찮음", label: "지금 찍어도 괜찮아요", eyebrow: "괜찮음 · GOOD TO GO", color: "#d17b2c" },
  비추천: { shortLabel: "시간 조정 추천", label: "조금 기다리면 더 좋아요", eyebrow: "시간 조정 추천 · BETTER TIME AHEAD", color: "#ce5b59" },
};

const PLACE_SYMBOLS: Record<string, string> = { hyeopjae: "波", saryeoni: "森", dodu: "虹" };
const CONCEPT_SYMBOLS: Record<string, string> = { refreshing: "01", natural: "02", sunset: "03", cozy: "04", film: "05", sparkling: "06" };
const CONCEPT_ORDER = ["refreshing", "natural", "sunset", "cozy", "film", "sparkling"];
const TRANSPORT_LABELS: Record<TransportMode, string> = { car: "자동차", transit: "대중교통", walk: "도보" };
const HISTORY_KEY = "scene-jeju-analysis-history-v1";
const RESULT_THEMES: Record<string, {
  background: string;
  accent: string;
  glow: string;
  muted: string;
  start: string;
  middle: string;
  end: string;
  card: string;
  line: string;
  editor: string;
  orb: string;
}> = {
  refreshing: { background: "#e9f8ff", accent: "#187ca1", glow: "rgba(88,197,240,.34)", muted: "#4e6c76", start: "#f2fbff", middle: "#a9ddf2", end: "#e5f6ee", card: "rgba(255,255,255,.76)", line: "rgba(38,91,108,.16)", editor: "#123b48", orb: "rgba(255,255,255,.72)" },
  natural: { background: "#eff5e9", accent: "#347653", glow: "rgba(142,190,122,.28)", muted: "#536a58", start: "#faf5d9", middle: "#bfd7ac", end: "#e8f1e4", card: "rgba(255,255,255,.74)", line: "rgba(54,101,68,.16)", editor: "#244434", orb: "rgba(255,245,188,.66)" },
  sunset: { background: "#f9d5bd", accent: "#a44358", glow: "rgba(239,118,95,.34)", muted: "#6d5261", start: "#fff1c9", middle: "#f3aa82", end: "#d3b0d5", card: "rgba(255,249,244,.75)", line: "rgba(113,61,78,.16)", editor: "#4b2e46", orb: "rgba(255,224,143,.82)" },
  cozy: { background: "#f7ecdc", accent: "#8a6740", glow: "rgba(225,184,134,.30)", muted: "#706253", start: "#fff9ea", middle: "#ead5b8", end: "#f4e7dc", card: "rgba(255,253,247,.78)", line: "rgba(116,88,53,.15)", editor: "#4a3d30", orb: "rgba(255,239,199,.78)" },
  film: { background: "#e6ebf0", accent: "#53677f", glow: "rgba(119,135,157,.28)", muted: "#5f6977", start: "#f0f2f5", middle: "#b8c5d2", end: "#d9d5df", card: "rgba(249,250,252,.76)", line: "rgba(62,77,96,.16)", editor: "#303b49", orb: "rgba(228,235,243,.72)" },
  sparkling: { background: "#e8fbf7", accent: "#167d71", glow: "rgba(78,210,186,.30)", muted: "#466d68", start: "#f3fffc", middle: "#9de5da", end: "#ddf8f5", card: "rgba(255,255,255,.76)", line: "rgba(31,105,94,.16)", editor: "#174842", orb: "rgba(255,255,255,.80)" },
};

function createSavedId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatKoreanDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatKstDatetimeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function kstLocalToIso(value: string): string {
  return `${value}:00+09:00`;
}

function getLightingIssue(solar: Analysis["solar"]): string {
  if (solar.lighting_issue) return solar.lighting_issue;
  return solar.reflection_risk && solar.reflection_risk !== "낮음" ? "수면 반사와 역광" : "빛 조건 안정";
}

function getRainLabel(amount: number): string {
  if (amount <= 0) return "비 걱정 없어요";
  if (amount < 1) return "약한 비가 와요";
  return "비가 제법 와요";
}

function getWindLabel(speed: number): string {
  if (speed < 2) return "거의 잔잔해요";
  if (speed < 5) return "산들바람이 불어요";
  if (speed < 8) return "바람이 조금 강해요";
  return "바람이 매우 강해요";
}

function getLightLabel(solar: Analysis["solar"]): string {
  if (solar.elevation < -6 || solar.ghi_wm2 < 25) return "자연광이 부족해요";
  if (solar.ghi_wm2 >= 700) return "빛이 매우 강해요";
  if (solar.ghi_wm2 >= 400) return "빛이 충분해요";
  if (solar.ghi_wm2 >= 120) return "빛이 부드러워요";
  return "빛이 약해요";
}

function getLightAdvice(solar: Analysis["solar"]): string {
  const issue = getLightingIssue(solar);
  if (issue === "수면 반사와 역광") return "물에 반사된 빛 때문에 얼굴이 어두워질 수 있어요";
  if (issue === "나뭇잎 사이 얼룩 그림자") return "얼굴에 얼룩진 그림자가 생길 수 있어요";
  if (issue === "유리·노면 반사" || issue === "유리·젖은 노면 반사") return "바닥이나 유리의 반사광을 조심하세요";
  if (issue === "강한 직사광과 건물 그림자" || issue === "강한 직사광") return "얼굴 아래 그림자가 진해질 수 있어요";
  if (issue === "창문 역광과 실내외 명암차") return "창문을 등지면 얼굴이 어두워질 수 있어요";
  if (issue === "자연광 부족") return "휴대폰을 고정하면 흔들림을 줄일 수 있어요";
  return "얼굴과 배경의 밝기가 안정적이에요";
}

function readHistory(): SavedAnalysis[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SavedAnalysis[]) : [];
  } catch {
    return [];
  }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <div className="score-label"><span>{label}</span><strong>{value}</strong></div>
      <div className="score-track" aria-label={`${label} ${value}점`}><span style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedConcept, setSelectedConcept] = useState("refreshing");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("video");
  const [transportMode, setTransportMode] = useState<TransportMode>("car");
  const [destinationName, setDestinationName] = useState("협재해수욕장");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>("hyeopjae");
  const [destinationLatitude, setDestinationLatitude] = useState("33.3941");
  const [destinationLongitude, setDestinationLongitude] = useState("126.2397");
  const [placeType, setPlaceType] = useState<"beach" | "forest" | "urban" | "indoor">("beach");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [placeSearchMessage, setPlaceSearchMessage] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [latitude, setLatitude] = useState("33.5104");
  const [longitude, setLongitude] = useState("126.4914");
  const [departureTime, setDepartureTime] = useState(() => formatKstDatetimeLocal(new Date()));
  const [departNow, setDepartNow] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<SavedAnalysis[]>(readHistory);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    getCatalog().then(setCatalog).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다.");
    });
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("apple-motion");
    const observedScenes = new WeakSet<Element>();
    const sceneObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          sceneObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    const observeNewScenes = () => {
      document.querySelectorAll<HTMLElement>(".apple-scene").forEach((element) => {
        if (observedScenes.has(element)) return;
        observedScenes.add(element);
        sceneObserver.observe(element);
      });
    };
    const mutationObserver = new MutationObserver(observeNewScenes);
    mutationObserver.observe(document.getElementById("root") ?? document.body, { childList: true, subtree: true });
    observeNewScenes();
    return () => {
      mutationObserver.disconnect();
      sceneObserver.disconnect();
      document.documentElement.classList.remove("apple-motion");
    };
  }, []);

  const applyPlacePreset = (place: Place) => {
    setSelectedPresetId(place.id);
    setDestinationName(place.name);
    setDestinationLatitude(String(place.latitude));
    setDestinationLongitude(String(place.longitude));
    setPlaceType(place.place_type as typeof placeType);
    setPlaceResults([]);
    setPlaceSearchMessage("예시 장소의 좌표를 불러왔습니다.");
  };

  const runPlaceSearch = async () => {
    if (destinationName.trim().length < 2) {
      setPlaceSearchMessage("장소명을 두 글자 이상 입력해 주세요.");
      return;
    }
    setSearchingPlace(true);
    setPlaceSearchMessage(null);
    try {
      const results = await searchPlaces(destinationName.trim());
      setPlaceResults(results);
      if (!results.length) setPlaceSearchMessage("제주 안에서 일치하는 장소를 찾지 못했습니다.");
    } catch (reason) {
      setPlaceResults([]);
      setPlaceSearchMessage(reason instanceof Error ? reason.message : "장소 검색에 실패했습니다.");
    } finally {
      setSearchingPlace(false);
    }
  };

  const selectPlaceResult = (place: PlaceSearchResult) => {
    setSelectedPresetId(null);
    setDestinationName(place.name);
    setDestinationLatitude(place.latitude.toFixed(6));
    setDestinationLongitude(place.longitude.toFixed(6));
    setPlaceType(place.place_type);
    setPlaceResults([]);
    setPlaceSearchMessage(`${place.address}의 좌표와 장소 유형을 입력했습니다.`);
  };

  const selectMapPoint = useCallback(async (nextLatitude: number, nextLongitude: number) => {
    setSelectedPresetId(null);
    setDestinationLatitude(nextLatitude.toFixed(6));
    setDestinationLongitude(nextLongitude.toFixed(6));
    setPlaceSearchMessage("지도 주변 장소를 확인하는 중이에요.");
    try {
      const place = await reversePlace(nextLatitude, nextLongitude);
      setDestinationName(place.name);
      setDestinationLatitude(place.latitude.toFixed(6));
      setDestinationLongitude(place.longitude.toFixed(6));
      setPlaceType(place.place_type);
      setPlaceSearchMessage(`${place.address} 주변 장소를 자동으로 입력했습니다. 유형이 다르면 수정해 주세요.`);
    } catch (reason) {
      setPlaceSearchMessage(reason instanceof Error ? `${reason.message} 좌표는 그대로 입력했습니다.` : "좌표는 입력했지만 장소명은 확인하지 못했습니다.");
    }
  }, []);

  const useCurrentLocation = () => {
    setError(null);
    if (!window.isSecureContext) {
      setLocationMessage("휴대폰에서는 HTTPS 주소에서만 내 위치를 불러올 수 있어요. 현재는 제주공항 좌표를 그대로 사용하거나 좌표를 직접 입력해 주세요.");
      return;
    }
    if (!navigator.geolocation) {
      setLocationMessage("이 브라우저는 현재 위치 확인을 지원하지 않아요. 좌표를 직접 입력해 주세요.");
      return;
    }
    setLocating(true);
    setLocationMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setLocationMessage("현재 위치 좌표를 불러왔어요.");
        setLocating(false);
      },
      (reason) => {
        setLocationMessage(
          reason.code === reason.PERMISSION_DENIED
            ? "Safari 설정에서 이 사이트의 위치 권한을 허용하거나 좌표를 직접 입력해 주세요."
            : "현재 위치를 확인하지 못했어요. 좌표를 직접 입력해 주세요.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const runAnalysis = async () => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const parsedDestinationLatitude = Number(destinationLatitude);
    const parsedDestinationLongitude = Number(destinationLongitude);
    if (![parsedLatitude, parsedLongitude, parsedDestinationLatitude, parsedDestinationLongitude].every(Number.isFinite)) {
      setError("현재 위치와 촬영 장소 좌표를 숫자로 입력해 주세요.");
      return;
    }
    if (
      parsedDestinationLatitude < 33.05 || parsedDestinationLatitude > 33.65
      || parsedDestinationLongitude < 125.95 || parsedDestinationLongitude > 127.05
    ) {
      setError("촬영 장소는 제주도 안에서 선택해 주세요.");
      return;
    }
    if (!destinationName.trim()) {
      setError("촬영 장소명을 입력해 주세요.");
      return;
    }
    let selectedDepartureTime = new Date().toISOString();
    if (!departNow) {
      const parsedDepartureTime = new Date(kstLocalToIso(departureTime));
      if (!departureTime || Number.isNaN(parsedDepartureTime.getTime())) {
        setError("출발 날짜와 시간을 선택해 주세요.");
        return;
      }
      const now = Date.now();
      if (parsedDepartureTime.getTime() < now - 5 * 60 * 1000) {
        setError("출발 시각은 현재보다 이르게 설정할 수 없습니다.");
        return;
      }
      if (parsedDepartureTime.getTime() > now + 48 * 60 * 60 * 1000) {
        setError("예보를 확인할 수 있도록 출발 시각은 48시간 안으로 선택해 주세요.");
        return;
      }
      selectedDepartureTime = parsedDepartureTime.toISOString();
    }
    setLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await analyze({
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        placeId: selectedPresetId ?? undefined,
        place: selectedPresetId ? undefined : {
            name: destinationName.trim(),
            latitude: parsedDestinationLatitude,
            longitude: parsedDestinationLongitude,
            placeType,
          },
        conceptId: selectedConcept,
        captureMode,
        transportMode,
        departureTime: selectedDepartureTime,
      });
      setAnalysis(result);
      window.setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const saveAnalysis = () => {
    if (!analysis) return;
    const saved: SavedAnalysis = { id: createSavedId(), savedAt: new Date().toISOString(), analysis };
    const next = [saved, ...history].slice(0, 10);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      setHistory(next);
      setActionMessage("이 기기에 분석 결과를 저장했습니다. 아래 ‘저장한 촬영 계획’에서 다시 볼 수 있어요.");
    } catch {
      setActionMessage("Safari의 개인정보 보호 설정 때문에 저장하지 못했습니다. 일반 탭에서 다시 시도해 주세요.");
    }
  };

  const deleteSaved = (id: string) => {
    const next = history.filter((item) => item.id !== id);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const shareAnalysis = async () => {
    if (!analysis) return;
    const text = `${analysis.place.name} ${analysis.concept.name} 촬영 적합도 ${analysis.scores.total}점. 추천 시각은 ${formatKoreanDate(analysis.best_time)}입니다.`;
    try {
      setActionMessage("분석 결과 이미지를 만드는 중이에요.");
      const card = await createAnalysisCard(analysis);
      if (navigator.share && navigator.canShare?.({ files: [card] })) {
        await navigator.share({ title: "분위기 메이커 촬영 분석", text, files: [card] });
        setActionMessage("분석 결과 이미지 공유를 마쳤습니다.");
      } else if (navigator.share) {
        await navigator.share({ title: "분위기 메이커 촬영 분석", text });
        setActionMessage("공유 메뉴를 열었습니다. 이 브라우저는 이미지 첨부를 지원하지 않습니다.");
      } else {
        const url = URL.createObjectURL(card);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = card.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          setActionMessage("분석 결과 이미지를 저장했습니다. 공유 문구도 복사했습니다.");
        } else {
          setActionMessage("분석 결과 이미지를 저장했습니다.");
        }
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setActionMessage("공유하지 못했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };

  const statusMeta = analysis ? STATUS_META[analysis.status] : null;
  const selectedConceptAccent = catalog?.concepts.find((concept) => concept.id === selectedConcept)?.accent ?? "#62d1ab";
  const resultTheme = analysis ? RESULT_THEMES[analysis.concept.id] ?? RESULT_THEMES.refreshing : RESULT_THEMES.refreshing;
  const tourismTrend = analysis?.tourism_trend ?? {
    available: false,
    level: "자료 없음" as const,
    label: "이전에 저장한 분석에는 방문 경향이 없어요",
    matched_place_name: null,
    arrivals: null,
    rank: null,
    ranked_places: 10,
    reference_month: null,
    source: "제주관광빅데이터플랫폼",
    source_url: "https://data.ijto.or.kr/prog/dataPick/bigdata/sub02/view.do?regSn=48",
    source_kind: "snapshot" as const,
    is_realtime: false,
    explanation: "다시 분석하면 최신 관광지 도착 경향을 함께 확인할 수 있어요.",
    shooting_tip: "현장에 도착하면 방문객 흐름을 1분 정도 확인한 뒤 촬영하세요.",
  };
  const sourceLabel = analysis
    ? analysis.data_source.startsWith("kma") ? "LIVE WEATHER" : "DEMO WEATHER"
    : catalog?.mode === "real" ? "LIVE WEATHER" : catalog?.mode === "auto" ? "AUTO WEATHER" : "DEMO WEATHER";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="분위기 메이커 처음으로"><span className="brand-mark">M</span><span>분위기 메이커</span></a>
        <span className="mode-pill"><i /> {sourceLabel}</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy apple-hero">
          <p className="kicker">JEJU SHOOTING CONDITION</p>
          <h1>분위기는 감으로,<br /><em>타이밍은 데이터로.</em></h1>
          <p className="hero-description">도착할 때의 날씨와 태양 위치를 미리 계산해<br className="desktop-only" /> 제주에서 원하는 장면을 놓치지 않게 도와드려요.</p>
        </div>
      </section>

      <section className="planner-section">
        <div className="section-heading apple-scene"><span>01</span><div><p>PLAN YOUR SCENE</p><h2>어떤 장면을 남길까요?</h2></div></div>

        <div className="planner-grid">
          <div className="selection-panel apple-scene">
            <div className="field-header"><div><span className="field-number">A</span><h3>촬영 장소</h3></div><span className="field-note">SEARCH OR MAP</span></div>
            <div className="place-input-grid">
              <div className="destination-field destination-name">
                <span>PLACE NAME</span>
                <div className="place-search-input">
                  <input value={destinationName} onChange={(event) => { setSelectedPresetId(null); setDestinationName(event.target.value); setPlaceSearchMessage(null); }} onKeyDown={(event) => { if (event.key === "Enter") void runPlaceSearch(); }} placeholder="예: 함덕해수욕장" aria-label="촬영 장소명" />
                  <button type="button" onClick={runPlaceSearch} disabled={searchingPlace}>{searchingPlace ? "검색 중" : "장소 찾기"}</button>
                </div>
              </div>
              <label className="destination-field"><span>LAT</span><input value={destinationLatitude} onChange={(event) => { setSelectedPresetId(null); setDestinationLatitude(event.target.value); }} inputMode="decimal" aria-label="촬영 장소 위도" /></label>
              <label className="destination-field"><span>LON</span><input value={destinationLongitude} onChange={(event) => { setSelectedPresetId(null); setDestinationLongitude(event.target.value); }} inputMode="decimal" aria-label="촬영 장소 경도" /></label>
              <label className="destination-field"><span>TYPE · 검색 결과가 틀리면 수정</span><select value={placeType} onChange={(event) => { setSelectedPresetId(null); setPlaceType(event.target.value as typeof placeType); }} aria-label="촬영 장소 유형"><option value="beach">해변</option><option value="forest">숲길</option><option value="urban">도심</option><option value="indoor">실내</option></select></label>
              <div className="direction-auto-note"><span>AUTO DIRECTION</span><p>도착 시각의 태양 위치와 분위기에 맞춰 촬영자가 설 자리를 알려드려요.</p></div>
            </div>
            {placeResults.length > 0 && <div className="place-search-results" aria-label="장소 검색 결과">{placeResults.map((place) => <button type="button" key={place.id} onClick={() => selectPlaceResult(place)}><strong>{place.name}</strong><small>{place.address}</small></button>)}</div>}
            {placeSearchMessage && <p className="place-search-message">{placeSearchMessage}</p>}
            <div className="place-tools">
              <div className="preset-row"><span>빠른 입력</span>{catalog?.places.map((place) => <button type="button" key={place.id} onClick={() => applyPlacePreset(place)}>{PLACE_SYMBOLS[place.id]} {place.name}</button>)}</div>
              <button className="map-toggle" type="button" onClick={() => setShowMap((value) => !value)}>{showMap ? "지도 닫기" : "지도에서 위치 고르기"}</button>
            </div>
            {showMap && Number.isFinite(Number(destinationLatitude)) && Number.isFinite(Number(destinationLongitude)) && <KakaoMapPicker latitude={Number(destinationLatitude)} longitude={Number(destinationLongitude)} onChange={selectMapPoint} />}
          </div>

          <div className="selection-panel options-panel apple-scene">
            <div className="field-header"><div><span className="field-number">B</span><h3>원하는 분위기</h3></div><span className="field-note">6 MOODS</span></div>
            <div className="concept-grid">{catalog?.concepts.slice().sort((first, second) => CONCEPT_ORDER.indexOf(first.id) - CONCEPT_ORDER.indexOf(second.id)).map((concept) => <button type="button" className={`concept-card ${selectedConcept === concept.id ? "selected" : ""}`} key={concept.id} onClick={() => setSelectedConcept(concept.id)} style={{ "--accent": concept.accent } as CSSProperties}><span>{CONCEPT_SYMBOLS[concept.id]}</span><strong>{concept.name}</strong><small>{concept.description}</small></button>)}</div>
            <div className="sub-option-group">
              <span>무엇을 남길까요?</span>
              <div className="segmented-control"><button type="button" className={captureMode === "photo" ? "selected" : ""} onClick={() => setCaptureMode("photo")}>사진</button><button type="button" className={captureMode === "video" ? "selected" : ""} onClick={() => setCaptureMode("video")}>15초 영상</button></div>
            </div>
          </div>
        </div>

        <div className="location-panel apple-scene">
          <div className="location-title"><span className="field-number">C</span><div><h3>현재 위치, 출발 시각과 이동 방법</h3><p>제주공항 좌표와 지금 출발이 기본으로 들어가 있어요.</p></div></div>
          <div className="location-controls">
            <div className="coordinate-inputs">
              <label><span>LAT</span><input value={latitude} onChange={(event) => { setLatitude(event.target.value); setLocationMessage(null); }} inputMode="decimal" aria-label="현재 위치 위도" /></label>
              <label><span>LON</span><input value={longitude} onChange={(event) => { setLongitude(event.target.value); setLocationMessage(null); }} inputMode="decimal" aria-label="현재 위치 경도" /></label>
              <button type="button" className="location-button" onClick={useCurrentLocation} disabled={locating}><span>⌖</span> {locating ? "확인 중" : "내 위치"}</button>
            </div>
            <div className="transport-control" aria-label="이동 방법 선택">
              {(["car", "transit", "walk"] as TransportMode[]).map((mode) => <button type="button" key={mode} className={transportMode === mode ? "selected" : ""} onClick={() => setTransportMode(mode)}>{mode === "car" ? "🚗" : mode === "transit" ? "🚌" : "🚶"} {TRANSPORT_LABELS[mode]}</button>)}
            </div>
            <div className="departure-control">
              <label className="departure-field"><span>출발 날짜·시간</span><input type="datetime-local" value={departureTime} min={formatKstDatetimeLocal(new Date())} max={formatKstDatetimeLocal(new Date(Date.now() + 48 * 60 * 60 * 1000))} step="300" onChange={(event) => { setDepartureTime(event.target.value); setDepartNow(false); }} aria-label="출발 날짜와 시간" /></label>
              <button type="button" className={`depart-now-button ${departNow ? "selected" : ""}`} onClick={() => { setDepartureTime(formatKstDatetimeLocal(new Date())); setDepartNow(true); }}>지금 출발</button>
            </div>
            <p className="departure-hint">선택한 출발 시각에 이동시간을 더한 뒤, 실제 도착 시각의 날씨와 빛을 분석해요.</p>
          </div>
          <div className="route-preview"><span className="route-pin current">YOU</span><span className="route-line"><i /><i /><i /><i /><i /></span><span className="route-pin destination">{destinationName || "PLACE"}</span></div>
          {locationMessage && <p className="location-message" role="status">{locationMessage}</p>}
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="analyze-button apple-scene" style={{ "--analyze-accent": selectedConceptAccent } as CSSProperties} type="button" onClick={runAnalysis} disabled={!catalog || loading}><span><small>{loading ? "ANALYZING 13 TIME SLOTS" : "READY · WEATHER + LIGHT + ROUTE"}</small>{loading ? "시간대별 조건을 계산하는 중" : "이 조건으로 촬영 타이밍 분석하기"}</span><b>{loading ? "···" : "→"}</b></button>
      </section>

      {analysis && statusMeta && (
        <section className={`result-section concept-${analysis.concept.id}`} id="result" style={{
          "--deep": resultTheme.background,
          "--mint": resultTheme.accent,
          "--result-accent": resultTheme.accent,
          "--result-glow": resultTheme.glow,
          "--result-muted": resultTheme.muted,
          "--result-start": resultTheme.start,
          "--result-middle": resultTheme.middle,
          "--result-end": resultTheme.end,
          "--result-card": resultTheme.card,
          "--result-line": resultTheme.line,
          "--result-editor": resultTheme.editor,
          "--result-orb": resultTheme.orb,
        } as CSSProperties}>
          <div className="section-heading light-heading apple-scene"><span>02</span><div><p>YOUR SHOOTING FORECAST</p><h2>추천 시각의 촬영 조건</h2></div></div>
          {analysis.warning && <div className="warning-banner">{analysis.warning}</div>}
          <div className="result-hero apple-scene">
            <div className="score-ring" style={{ "--score": analysis.scores.total, "--status": statusMeta.color } as CSSProperties}><div><span>TOTAL</span><strong>{analysis.scores.total}</strong><small>/ 100</small></div></div>
            <div className="result-copy">
              <p style={{ color: statusMeta.color }}>{statusMeta.eyebrow}</p><h2>{statusMeta.label}</h2><strong>{analysis.place.name} · {analysis.concept.name}</strong><p>{analysis.summary}</p>
              <div className="arrival-strip"><span><small>출발</small>{formatKoreanDate(analysis.departure_time)}</span><i>→</i><span><small>예상 도착</small>{formatKoreanDate(analysis.arrival_time)}</span><i>→</i><span><small>추천 촬영</small>{formatKoreanDate(analysis.best_time)}</span><b>{TRANSPORT_LABELS[analysis.transport_mode]} {analysis.travel_minutes}분 · {analysis.distance_km}km</b></div>
              <p className="source-note">{analysis.travel_source === "kakao-mobility" ? "카카오 실제 자동차 경로" : "거리와 평균 속도를 이용한 예상 이동시간"}</p>
            </div>
          </div>

          <article className="best-time-panel apple-scene">
            <div><small>BEST SHOOTING TIME</small><strong>{formatKoreanDate(analysis.best_time)}</strong><p>{analysis.best_offset_minutes === 0 ? "도착 직후가 가장 좋아요." : `도착 후 ${analysis.best_offset_minutes / 60}시간 기다리면 조건이 더 좋아져요.`}</p></div>
            <span>{analysis.time_slots.find((slot) => slot.is_best)?.score ?? analysis.scores.total}<small>점</small></span>
          </article>

          <div className="time-slot-grid apple-scene" aria-label="시간대별 촬영 적합도">
            {analysis.time_slots.map((slot, index) => <article key={slot.time} className={slot.is_best ? "best" : ""}><span>{index === 0 ? "도착" : `도착 +${index}시간`}</span><strong>{formatTime(slot.time)}</strong><b style={{ color: STATUS_META[slot.status].color }}>{slot.score}점 · {STATUS_META[slot.status].shortLabel}</b><small>{slot.weather.sky} · {getWindLabel(slot.weather.wind_speed_mps)}{slot.is_best ? " · 추천" : ""}</small></article>)}
          </div>

          <div className="condition-grid apple-scene">
            <article className="condition-card"><span className="condition-icon">☂</span><small>비</small><strong className="text-value">{getRainLabel(analysis.weather.precipitation_mm)}</strong><p>{analysis.scores.rain >= 75 ? "렌즈를 닦을 필요가 거의 없어요" : "우산이나 처마가 필요해요"}</p></article>
            <article className="condition-card"><span className="condition-icon">≋</span><small>바람</small><strong className="text-value">{getWindLabel(analysis.weather.wind_speed_mps)}</strong><p>{analysis.scores.wind >= 75 ? "인물과 화면이 안정적이에요" : "두 손으로 단단히 잡으세요"}</p></article>
            <article className="condition-card"><span className="condition-icon">◒</span><small>하늘</small><strong className="text-value">{analysis.weather.sky}</strong><p>기상청 예보를 그대로 표시해요</p></article>
            <article className="condition-card"><span className="condition-icon">☼</span><small>빛</small><strong className="text-value">{getLightLabel(analysis.solar)}</strong><p>{getLightAdvice(analysis.solar)}</p></article>
          </div>

          <article className={`tourism-trend-panel trend-${tourismTrend.level.replace(/\s/g, "-")} apple-scene`}>
            <div className="tourism-trend-badge"><span>JEJU TOURISM DATA</span><strong>{tourismTrend.level}</strong></div>
            <div className="tourism-trend-copy">
              <small>최근 방문 경향 기반 혼잡 가능성</small>
              <h3>{tourismTrend.label}</h3>
              <p>{tourismTrend.explanation}</p>
              <b>{tourismTrend.shooting_tip}</b>
            </div>
            <div className="tourism-trend-meta">
              {tourismTrend.available && <strong>{tourismTrend.arrivals?.toLocaleString()}<small>대 도착</small></strong>}
              {tourismTrend.rank && <span>인기 장소 {tourismTrend.rank}/{tourismTrend.ranked_places}위</span>}
              <a href={tourismTrend.source_url} target="_blank" rel="noreferrer">제주관광빅데이터플랫폼 ↗</a>
              <small>실시간 혼잡도 아님 · {tourismTrend.source_kind === "live" ? "최신 공개 데이터" : "공식 데이터 저장본"}</small>
            </div>
          </article>

          <div className="detail-grid apple-scene">
            <article className="score-panel"><div className="panel-title"><span>CONDITION SCORE</span><small>추천 시각 기준</small></div><ScoreBar label="날씨" value={analysis.scores.weather} /><ScoreBar label="빛" value={analysis.scores.light} /><ScoreBar label="장소" value={analysis.scores.place} /></article>
            <article className="reason-panel"><div className="panel-title"><span>WHY THIS SCORE?</span><small>{analysis.data_source}</small></div><ul>{analysis.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></article>
          </div>

          <article className="guide-panel apple-scene">
            <div className="guide-heading"><div><span>{analysis.capture_mode === "video" ? "15-SECOND EARTH SCIENCE RECIPE" : "EARTH SCIENCE PHOTO RECIPE"}</span><h3>빛과 날씨의 원리를 따라 찍어보세요</h3></div><p className="direction-guide"><small>어디서, 왜 이렇게 찍나요?</small>{analysis.shooting_direction_guide}</p></div>
            <ol>{analysis.guide.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
          </article>

          <MediaStudio analysis={analysis} captureMode={analysis.capture_mode} />
          <div className="result-actions apple-scene"><button type="button" onClick={saveAnalysis}>결과 저장</button><button type="button" onClick={shareAnalysis}>분석결과 저장하기</button>{actionMessage && <span>{actionMessage}</span>}</div>
        </section>
      )}

      {history.length > 0 && (
        <section className="history-section">
          <div className="section-heading apple-scene"><span>03</span><div><p>MY SCENES</p><h2>저장한 촬영 계획</h2></div></div>
          <div className="history-list apple-scene">{history.map((item) => <article key={item.id}><button type="button" className="history-open" onClick={() => { setAnalysis(item.analysis); window.setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth" }), 50); }}><small>{formatKoreanDate(item.savedAt)}</small><strong>{item.analysis.place.name}</strong><span>{item.analysis.concept.name} · {item.analysis.scores.total}점 · {STATUS_META[item.analysis.status]?.shortLabel ?? item.analysis.status}</span></button><button type="button" className="history-delete" onClick={() => deleteSaved(item.id)} aria-label="저장 기록 삭제">×</button></article>)}</div>
        </section>
      )}

      <footer><span>MOOD MAKER · JEJU</span><p>날씨가 장면을 망치기 전에, 데이터로 분위기를 준비합니다.</p></footer>
    </main>
  );
}
