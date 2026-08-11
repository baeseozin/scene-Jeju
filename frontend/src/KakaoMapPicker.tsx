import { useEffect, useRef, useState, type MouseEvent } from "react";

interface KakaoMapPickerProps {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
}

declare global {
  interface Window {
    kakao?: any;
  }
}

const JEJU_BOUNDS = {
  minLatitude: 33.12,
  maxLatitude: 33.58,
  minLongitude: 126.05,
  maxLongitude: 126.97,
};

let kakaoLoader: Promise<void> | null = null;

function loadKakaoMap(key: string): Promise<void> {
  if (window.kakao?.maps) {
    return new Promise((resolve) => window.kakao.maps.load(resolve));
  }
  if (kakaoLoader) return kakaoLoader;
  const previousScript = document.querySelector<HTMLScriptElement>("script[data-scene-jeju-kakao]");
  previousScript?.remove();
  const loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.sceneJejuKakao = "true";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&sceneJeju=${Date.now()}`;
    script.async = true;
    script.referrerPolicy = "origin";
    script.onload = () => {
      if (!window.kakao?.maps) {
        reject(new Error("카카오 지도 SDK를 불러오지 못했습니다."));
        return;
      }
      window.kakao.maps.load(resolve);
    };
    script.onerror = () => reject(new Error("카카오 지도 연결에 실패했습니다."));
    document.head.appendChild(script);
  });
  kakaoLoader = loader.catch((reason) => {
    kakaoLoader = null;
    throw reason;
  });
  return kakaoLoader;
}

export default function KakaoMapPicker({ latitude, longitude, onChange }: KakaoMapPickerProps) {
  const mapKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY?.trim();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!mapKey || !containerRef.current) return;
    let active = true;
    loadKakaoMap(mapKey)
      .then(() => {
        if (!active || !containerRef.current || !window.kakao) return;
        const center = new window.kakao.maps.LatLng(latitude, longitude);
        const map = new window.kakao.maps.Map(containerRef.current, { center, level: 7 });
        const marker = new window.kakao.maps.Marker({ position: center, map });
        window.kakao.maps.event.addListener(map, "click", (event: any) => {
          const next = event.latLng;
          marker.setPosition(next);
          onChangeRef.current(next.getLat(), next.getLng());
        });
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch((reason: unknown) => {
        setMapError(reason instanceof Error ? reason.message : "카카오 지도 연결에 실패했습니다.");
      });
    return () => {
      active = false;
    };
  }, [mapKey, retryCount]);

  useEffect(() => {
    if (!window.kakao || !mapRef.current || !markerRef.current) return;
    const position = new window.kakao.maps.LatLng(latitude, longitude);
    markerRef.current.setPosition(position);
    mapRef.current.panTo(position);
  }, [latitude, longitude]);

  if (mapKey && !mapError) {
    return (
      <div className="map-picker-shell">
        <div className="kakao-map" ref={containerRef} aria-label="카카오 지도에서 촬영 장소 선택" />
        <p>지도를 눌러 촬영 지점을 바꿀 수 있어요.</p>
      </div>
    );
  }

  const markerX = ((longitude - JEJU_BOUNDS.minLongitude) / (JEJU_BOUNDS.maxLongitude - JEJU_BOUNDS.minLongitude)) * 600;
  const markerY = ((JEJU_BOUNDS.maxLatitude - latitude) / (JEJU_BOUNDS.maxLatitude - JEJU_BOUNDS.minLatitude)) * 300;

  const handleFallbackClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const yRatio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    onChange(
      JEJU_BOUNDS.maxLatitude - yRatio * (JEJU_BOUNDS.maxLatitude - JEJU_BOUNDS.minLatitude),
      JEJU_BOUNDS.minLongitude + xRatio * (JEJU_BOUNDS.maxLongitude - JEJU_BOUNDS.minLongitude),
    );
  };

  return (
    <div className="map-picker-shell fallback-map">
      <svg viewBox="0 0 600 300" onClick={handleFallbackClick} role="img" aria-label="제주 간편 지도에서 촬영 장소 선택">
        <path d="M62 168C86 120 150 84 235 66c95-20 213-4 276 43 51 37 45 79-5 110-69 42-188 54-295 35C112 237 35 213 62 168Z" />
        <circle cx={Math.max(0, Math.min(600, markerX))} cy={Math.max(0, Math.min(300, markerY))} r="10" />
        <text x="300" y="156">JEJU</text>
      </svg>
      {mapError ? (
        <div className="map-error-help">
          <p>{mapError} 간편 지도로도 좌표를 정할 수 있어요.</p>
          <small>카카오 Web 도메인 등록값: {window.location.origin}</small>
          <button type="button" onClick={() => { setMapError(null); setRetryCount((value) => value + 1); }}>지도 다시 연결</button>
        </div>
      ) : (
        <p>JavaScript 키가 없어 간편 지도를 표시했어요. 지도를 눌러 좌표를 정할 수 있어요.</p>
      )}
    </div>
  );
}
