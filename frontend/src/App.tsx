import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { analyze, getCatalog } from "./api";
import type { Analysis, Catalog, Status } from "./types";

const STATUS_META: Record<Status, { label: string; eyebrow: string; color: string }> = {
  가능: { label: "지금 가도 좋아요", eyebrow: "READY TO SHOOT", color: "#1f8f72" },
  보통: { label: "조금 손보면 좋아요", eyebrow: "ADJUST & SHOOT", color: "#d17b2c" },
  비추천: { label: "다른 때가 나아요", eyebrow: "WAIT FOR IT", color: "#ce5b59" },
};

const PLACE_SYMBOLS: Record<string, string> = {
  hyeopjae: "波",
  saryeoni: "森",
  dodu: "虹",
};

const CONCEPT_SYMBOLS: Record<string, string> = {
  refreshing: "01",
  film: "02",
  sunset: "03",
};

function formatKoreanDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <div className="score-label">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="score-track" aria-label={`${label} ${value}점`}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedPlace, setSelectedPlace] = useState("hyeopjae");
  const [selectedConcept, setSelectedConcept] = useState("refreshing");
  const [latitude, setLatitude] = useState("33.5104");
  const [longitude, setLongitude] = useState("126.4914");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다.");
      });
  }, []);

  const chosenPlace = useMemo(
    () => catalog?.places.find((place) => place.id === selectedPlace),
    [catalog, selectedPlace],
  );

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("이 브라우저는 현재 위치 확인을 지원하지 않습니다.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("위치 권한을 확인할 수 없습니다. 좌표를 직접 입력해 주세요.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const runAnalysis = async () => {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
      setError("현재 위치의 위도와 경도를 숫자로 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await analyze({
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        placeId: selectedPlace,
        conceptId: selectedConcept,
      });
      setAnalysis(result);
      window.setTimeout(() => {
        document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const statusMeta = analysis ? STATUS_META[analysis.status] : null;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="분위기 메이커 처음으로">
          <span className="brand-mark">M</span>
          <span>분위기 메이커</span>
        </a>
        <span className="mode-pill">
          <i /> {catalog?.mode === "mock" ? "DEMO DATA" : "LIVE WEATHER"}
        </span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">JEJU SHOOTING CONDITION</p>
          <h1>
            분위기는 감으로,
            <br />
            <em>타이밍은 데이터로.</em>
          </h1>
          <p className="hero-description">
            도착할 때의 날씨와 태양 위치를 미리 계산해
            <br className="desktop-only" /> 제주에서 원하는 장면을 놓치지 않게 도와드려요.
          </p>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-circle orbit-one" />
          <div className="orbit-circle orbit-two" />
          <span className="sun-dot" />
          <span className="orbit-label label-weather">WEATHER</span>
          <span className="orbit-label label-light">LIGHT</span>
          <span className="orbit-label label-place">PLACE</span>
          <strong>15<span>SEC</span></strong>
        </div>
      </section>

      <section className="planner-section">
        <div className="section-heading">
          <span>01</span>
          <div>
            <p>PLAN YOUR SCENE</p>
            <h2>어떤 장면을 남길까요?</h2>
          </div>
        </div>

        <div className="planner-grid">
          <div className="selection-panel">
            <div className="field-header">
              <div>
                <span className="field-number">A</span>
                <h3>촬영 장소</h3>
              </div>
              <span className="field-note">3 PLACES</span>
            </div>
            <div className="place-list">
              {catalog?.places.map((place) => (
                <button
                  type="button"
                  className={`place-card ${selectedPlace === place.id ? "selected" : ""}`}
                  key={place.id}
                  onClick={() => setSelectedPlace(place.id)}
                  style={{ "--accent": place.accent } as CSSProperties}
                >
                  <span className="place-symbol">{PLACE_SYMBOLS[place.id]}</span>
                  <span className="place-copy">
                    <strong>{place.name}</strong>
                    <small>{place.description}</small>
                  </span>
                  <span className="select-indicator">↗</span>
                </button>
              ))}
            </div>
          </div>

          <div className="selection-panel">
            <div className="field-header">
              <div>
                <span className="field-number">B</span>
                <h3>원하는 분위기</h3>
              </div>
              <span className="field-note">3 MOODS</span>
            </div>
            <div className="concept-grid">
              {catalog?.concepts.map((concept) => (
                <button
                  type="button"
                  className={`concept-card ${selectedConcept === concept.id ? "selected" : ""}`}
                  key={concept.id}
                  onClick={() => setSelectedConcept(concept.id)}
                  style={{ "--accent": concept.accent } as CSSProperties}
                >
                  <span>{CONCEPT_SYMBOLS[concept.id]}</span>
                  <strong>{concept.name}</strong>
                  <small>{concept.description}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="location-panel">
          <div className="location-title">
            <span className="field-number">C</span>
            <div>
              <h3>현재 위치</h3>
              <p>제주공항 좌표가 기본으로 들어가 있어요.</p>
            </div>
          </div>
          <div className="coordinate-inputs">
            <label>
              <span>LAT</span>
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                inputMode="decimal"
                aria-label="현재 위치 위도"
              />
            </label>
            <label>
              <span>LON</span>
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                inputMode="decimal"
                aria-label="현재 위치 경도"
              />
            </label>
            <button type="button" className="location-button" onClick={useCurrentLocation} disabled={locating}>
              <span>⌖</span> {locating ? "위치 확인 중" : "내 위치 사용"}
            </button>
          </div>
          <div className="route-preview">
            <span className="route-pin current">YOU</span>
            <span className="route-line"><i /><i /><i /><i /><i /></span>
            <span className="route-pin destination">{chosenPlace?.name ?? "PLACE"}</span>
          </div>
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="analyze-button" type="button" onClick={runAnalysis} disabled={!catalog || loading}>
          <span>{loading ? "도착 시각의 조건을 계산하는 중" : "촬영 타이밍 분석하기"}</span>
          <b>{loading ? "···" : "→"}</b>
        </button>
      </section>

      {analysis && statusMeta && (
        <section className="result-section" id="result">
          <div className="section-heading light-heading">
            <span>02</span>
            <div>
              <p>YOUR SHOOTING FORECAST</p>
              <h2>도착했을 때의 촬영 조건</h2>
            </div>
          </div>

          {analysis.warning && <div className="warning-banner">{analysis.warning}</div>}

          <div className="result-hero">
            <div className="score-ring" style={{ "--score": analysis.scores.total, "--status": statusMeta.color } as CSSProperties}>
              <div>
                <span>TOTAL</span>
                <strong>{analysis.scores.total}</strong>
                <small>/ 100</small>
              </div>
            </div>
            <div className="result-copy">
              <p style={{ color: statusMeta.color }}>{statusMeta.eyebrow}</p>
              <h2>{statusMeta.label}</h2>
              <strong>{analysis.place.name} · {analysis.concept.name}</strong>
              <p>{analysis.summary}</p>
              <div className="arrival-strip">
                <span><small>출발</small>{formatKoreanDate(analysis.departure_time)}</span>
                <i>→</i>
                <span><small>예상 도착</small>{formatKoreanDate(analysis.arrival_time)}</span>
                <b>{analysis.travel_minutes}분 · {analysis.distance_km}km</b>
              </div>
            </div>
          </div>

          <div className="condition-grid">
            <article className="condition-card">
              <span className="condition-icon">☂</span>
              <small>RAIN</small>
              <strong>{analysis.weather.precipitation_mm}<em> mm</em></strong>
              <p>{analysis.scores.rain >= 75 ? "강수 걱정이 적어요" : "비 대비가 필요해요"}</p>
            </article>
            <article className="condition-card">
              <span className="condition-icon">≋</span>
              <small>WIND</small>
              <strong>{analysis.weather.wind_speed_mps}<em> m/s</em></strong>
              <p>{analysis.scores.wind >= 75 ? "움직임이 안정적이에요" : "흔들림에 주의하세요"}</p>
            </article>
            <article className="condition-card">
              <span className="condition-icon">◒</span>
              <small>SKY</small>
              <strong className="text-value">{analysis.weather.sky}</strong>
              <p>{analysis.scores.sky >= 75 ? "분위기와 잘 맞아요" : "색감 보정이 필요해요"}</p>
            </article>
            <article className="condition-card">
              <span className="condition-icon">☼</span>
              <small>SUN</small>
              <strong>{analysis.solar.elevation}°<em> / {analysis.solar.azimuth}°</em></strong>
              <p>고도 · 방위각</p>
            </article>
          </div>

          <div className="detail-grid">
            <article className="score-panel">
              <div className="panel-title">
                <span>CONDITION SCORE</span>
                <small>도착 시각 기준</small>
              </div>
              <ScoreBar label="날씨" value={analysis.scores.weather} />
              <ScoreBar label="빛" value={analysis.scores.light} />
              <ScoreBar label="장소" value={analysis.scores.place} />
            </article>

            <article className="reason-panel">
              <div className="panel-title">
                <span>WHY THIS SCORE?</span>
                <small>{analysis.data_source}</small>
              </div>
              <ul>
                {analysis.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </article>
          </div>

          <article className="guide-panel">
            <div className="guide-heading">
              <div>
                <span>15-SECOND RECIPE</span>
                <h3>이 순서대로 촬영해 보세요</h3>
              </div>
              <p><small>권장 방향</small>{analysis.place.direction_label}</p>
            </div>
            <ol>
              {analysis.guide.map((step, index) => (
                <li key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </article>
        </section>
      )}

      <footer>
        <span>MOOD MAKER · JEJU</span>
        <p>날씨가 장면을 망치기 전에, 데이터로 분위기를 준비합니다.</p>
      </footer>
    </main>
  );
}
