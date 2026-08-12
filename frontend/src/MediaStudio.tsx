import { useEffect, useRef, useState } from "react";

import { getPoseRecommendations } from "./api";
import type {
  Analysis,
  CaptureMode,
  FramingMode,
  PoseGuideType,
  PoseRecommendationResponse,
} from "./types";

interface MediaStudioProps {
  analysis: Analysis;
  captureMode: CaptureMode;
}

interface LocalMedia {
  id: string;
  file: File;
  url: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  muted: boolean;
  speed: 0.5 | 1 | 1.5 | 2;
  filter: FilterPreset;
  brightness: number;
  zoom: number;
  positionX: number;
  positionY: number;
}

interface RenderedMedia {
  blob: Blob;
  extension: "mp4" | "webm" | "jpg";
}

type FilterPreset = "none" | "warm" | "cool" | "film" | "mono";
type TransitionPreset = "cut" | "fade";
type CaptionPosition = "top" | "center" | "bottom";
type CameraFacing = "environment" | "user";
interface PoseGuide {
  id: PoseGuideType;
  label: string;
  description: string;
}

const FILTER_OPTIONS: Array<{ id: FilterPreset; label: string }> = [
  { id: "none", label: "원본" },
  { id: "warm", label: "따뜻" },
  { id: "cool", label: "청량" },
  { id: "film", label: "필름" },
  { id: "mono", label: "흑백" },
];
const SPEED_OPTIONS: LocalMedia["speed"][] = [0.5, 1, 1.5, 2];
const POSE_GUIDES: PoseGuide[] = [
  { id: "open", label: "시원하게", description: "양팔을 몸에서 살짝 떼고 한쪽 무릎을 편하게 굽혀요." },
  { id: "walk", label: "걷는 순간", description: "한 발을 앞으로 내딛고 시선은 진행 방향보다 조금 옆에 둬요." },
  { id: "side", label: "옆모습", description: "몸을 카메라 정면에서 45도 돌리고 턱만 카메라 쪽으로 살짝 당겨요." },
  { id: "soft", label: "차분하게", description: "어깨 힘을 빼고 두 손을 배 앞에서 가볍게 모아요." },
];

const MAX_FILES = 4;
const MAX_FILE_BYTES = 150 * 1024 * 1024;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const MAX_EXPORT_SECONDS = 15;
const MIN_CLIP_SECONDS = 0.5;
function PoseOverlay({ pose, opacity, framing }: { pose: PoseGuideType; opacity: number; framing: FramingMode }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const upperBody = framing === "upper_body";
  return (
    <svg
      className={`pose-overlay ${upperBody ? "upper-body" : "full-body"}`}
      viewBox="0 0 360 640"
      aria-hidden="true"
      style={{ opacity }}
    >
      <rect
        x="20"
        y="22"
        width="320"
        height="596"
        rx="28"
        fill="none"
        stroke="currentColor"
        strokeDasharray="8 12"
        strokeWidth="2"
      />
      <g transform={upperBody ? "translate(-144 -90) scale(1.8)" : undefined}>
      {pose === "open" && <g {...common}>
        <circle cx="180" cy="142" r="42" strokeWidth="13" />
        <path d="M180 191 C174 250 175 305 180 370" strokeWidth="34" />
        <path d="M163 222 C138 244 116 271 92 306 M197 222 C222 244 244 271 268 306" strokeWidth="22" />
        {!upperBody && <path d="M171 374 C153 425 137 478 125 548 M190 374 C211 425 226 478 239 548" strokeWidth="25" />}
      </g>}
      {pose === "walk" && <g {...common}>
        <circle cx="163" cy="140" r="41" strokeWidth="13" />
        <path d="M169 190 C169 247 180 306 190 365" strokeWidth="34" />
        <path d="M158 222 C137 247 121 280 105 315 M188 223 C207 250 230 267 260 278" strokeWidth="22" />
        {!upperBody && <path d="M185 369 C166 419 145 475 112 536 M196 369 C218 414 242 458 272 507" strokeWidth="25" />}
      </g>}
      {pose === "side" && <g {...common}>
        <circle cx="207" cy="146" r="40" strokeWidth="13" />
        <path d="M199 194 C196 250 181 309 174 369" strokeWidth="33" />
        <path d="M193 225 C215 257 225 286 230 320 M184 228 C162 251 150 277 143 306" strokeWidth="21" />
        {!upperBody && <path d="M171 372 C151 426 137 481 132 542 M182 372 C204 420 220 474 230 538" strokeWidth="25" />}
      </g>}
      {pose === "soft" && <g {...common}>
        <circle cx="180" cy="145" r="42" strokeWidth="13" />
        <path d="M180 195 C178 249 179 310 180 371" strokeWidth="35" />
        <path d="M163 225 C145 258 151 295 181 326 M197 225 C215 258 209 295 181 326" strokeWidth="22" />
        {!upperBody && <path d="M171 374 C160 428 153 486 151 545 M190 374 C202 428 208 486 211 545" strokeWidth="25" />}
      </g>}
      {pose === "open" && <g className="pose-face" {...common}>
        <circle cx="166" cy="137" r="4" fill="currentColor" stroke="none" />
        <circle cx="194" cy="137" r="4" fill="currentColor" stroke="none" />
        <path d="M180 140 L176 151 L183 151" strokeWidth="3" />
        <path d="M169 160 Q180 168 191 160" strokeWidth="3" />
      </g>}
      {pose === "walk" && <g className="pose-face" {...common}>
        <circle cx="151" cy="136" r="4" fill="currentColor" stroke="none" />
        <circle cx="174" cy="134" r="3.5" fill="currentColor" stroke="none" />
        <path d="M164 138 L160 150 L167 151" strokeWidth="3" />
        <path d="M153 159 Q163 165 173 158" strokeWidth="3" />
      </g>}
      {pose === "side" && <g className="pose-face" {...common}>
        <circle cx="205" cy="138" r="3" fill="currentColor" stroke="none" />
        <circle cx="221" cy="139" r="4" fill="currentColor" stroke="none" />
        <path d="M222 142 Q230 148 224 152 L218 152" strokeWidth="3" />
        <path d="M213 160 Q221 164 227 158" strokeWidth="3" />
      </g>}
      {pose === "soft" && <g className="pose-face" {...common}>
        <path d="M164 140 Q169 136 174 140 M186 140 Q191 136 196 140" strokeWidth="3.5" />
        <path d="M180 143 L176 154 L183 154" strokeWidth="3" />
        <path d="M171 163 Q180 168 189 163" strokeWidth="3" />
      </g>}
      </g>
      <path d="M180 30 V70 M160 50 H200" {...common} strokeWidth="2" />
    </svg>
  );
}

function createMediaId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function filterStyle(item: Pick<LocalMedia, "filter" | "brightness">): string {
  const preset = {
    none: "",
    warm: "sepia(.14) saturate(1.12) contrast(1.03)",
    cool: "saturate(.96) hue-rotate(9deg) contrast(1.04)",
    film: "sepia(.24) saturate(.82) contrast(1.12)",
    mono: "grayscale(1) contrast(1.1)",
  }[item.filter];
  return `${preset} brightness(${item.brightness / 100})`.trim();
}

function editedDuration(item: LocalMedia): number {
  return Math.max(0, item.trimEnd - item.trimStart) / item.speed;
}

function waitForEvent(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("미디어 파일을 읽지 못했습니다.")); };
    const cleanup = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", failed);
    };
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", failed, { once: true });
  });
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return minutes > 0
    ? `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`
    : `${seconds.toFixed(1)}초`;
}

async function readVideoDuration(url: string): Promise<number> {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = url;
  await waitForEvent(video, "loadedmetadata");
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error("영상 길이를 확인하지 못했습니다.");
  }
  return video.duration;
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { zoom?: number; positionX?: number; positionY?: number } = {},
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    sourceY = (sourceHeight - cropHeight) / 2;
  }
  const zoom = Math.max(1, options.zoom ?? 1);
  const zoomedWidth = cropWidth / zoom;
  const zoomedHeight = cropHeight / zoom;
  const horizontalRatio = ((options.positionX ?? 0) + 100) / 200;
  const verticalRatio = ((options.positionY ?? 0) + 100) / 200;
  sourceX += (cropWidth - zoomedWidth) * horizontalRatio;
  sourceY += (cropHeight - zoomedHeight) * verticalRatio;
  cropWidth = zoomedWidth;
  cropHeight = zoomedHeight;
  context.drawImage(source, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

function drawCaption(
  context: CanvasRenderingContext2D,
  title: string,
  position: CaptionPosition,
  width: number,
  height: number,
) {
  const text = title.trim().slice(0, 24);
  if (!text) return;
  const top = position === "top" ? 18 : position === "center" ? height / 2 - 36 : height - 90;
  context.fillStyle = "rgba(0,0,0,.38)";
  context.fillRect(0, top, width, 72);
  context.fillStyle = "white";
  context.textAlign = "center";
  context.font = "600 18px sans-serif";
  context.fillText(text, width / 2, top + 43, width - 36);
  context.textAlign = "start";
}

function recordingFormat(): { mimeType: string; extension: "mp4" | "webm" } | null {
  const candidates = [
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" as const },
    { mimeType: "video/mp4", extension: "mp4" as const },
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" as const },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" as const },
    { mimeType: "video/webm", extension: "webm" as const },
  ];
  return candidates.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

async function renderMontage(
  clips: LocalMedia[],
  title: string,
  transition: TransitionPreset,
  captionPosition: CaptionPosition,
  onProgress: (value: number) => void,
): Promise<RenderedMedia> {
  if (!HTMLCanvasElement.prototype.captureStream || !window.MediaRecorder) {
    throw new Error("이 브라우저는 영상 내보내기를 지원하지 않습니다. 최신 Safari 또는 Chrome을 사용해 주세요.");
  }
  const format = recordingFormat();
  if (!format) throw new Error("이 브라우저에서 MP4 또는 WebM 저장 형식을 찾지 못했습니다.");

  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("영상 편집 화면을 만들지 못했습니다.");

  const canvasStream = canvas.captureStream(30);
  const AudioContextClass = window.AudioContext;
  const audioContext = AudioContextClass ? new AudioContextClass() : null;
  const audioDestination = audioContext?.createMediaStreamDestination() ?? null;
  if (audioContext?.state === "suspended") await audioContext.resume();
  const outputStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(audioDestination?.stream.getAudioTracks() ?? []),
  ]);
  const recorder = new MediaRecorder(outputStream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: format.mimeType }));
    recorder.onerror = () => reject(new Error("브라우저 영상 인코더에서 오류가 발생했습니다."));
  });
  recorder.start(500);

  try {
    const totalSeconds = Math.min(
      MAX_EXPORT_SECONDS,
      clips.reduce((sum, clip) => sum + editedDuration(clip), 0),
    );
    if (totalSeconds < MIN_CLIP_SECONDS) {
      throw new Error("내보낼 영상 구간을 0.5초 이상 선택해 주세요.");
    }
    let renderedSeconds = 0;
    for (const [clipIndex, clip] of clips.entries()) {
      if (renderedSeconds >= totalSeconds) break;
      const selectedDuration = editedDuration(clip);
      const segmentDuration = Math.min(selectedDuration, totalSeconds - renderedSeconds);
      if (segmentDuration < 0.01) continue;
      const video = document.createElement("video");
      const videoUrl = URL.createObjectURL(clip.file);
      video.src = videoUrl;
      video.playsInline = true;
      video.loop = false;
      video.preload = "auto";
      try {
        await waitForEvent(video, "loadedmetadata");
        if (audioContext && audioDestination && !clip.muted) {
          const source = audioContext.createMediaElementSource(video);
          source.connect(audioDestination);
          video.muted = false;
        } else {
          video.muted = true;
        }
        if (clip.trimStart > 0.01) {
          const seeked = waitForEvent(video, "seeked");
          video.currentTime = Math.min(clip.trimStart, Math.max(0, video.duration - 0.05));
          await seeked;
        }
        video.playbackRate = clip.speed;
        await video.play();
        const segmentStarted = performance.now();
        const sourceSegmentEnd = Math.min(clip.trimEnd, clip.trimStart + segmentDuration * clip.speed);
        await new Promise<void>((resolve) => {
          const frame = () => {
            context.filter = filterStyle(clip);
            drawCover(
              context,
              video,
              video.videoWidth,
              video.videoHeight,
              0,
              0,
              canvas.width,
              canvas.height,
              { zoom: clip.zoom, positionX: clip.positionX, positionY: clip.positionY },
            );
            context.filter = "none";
            const elapsed = (performance.now() - segmentStarted) / 1000;
            if (transition === "fade" && clips.length > 1) {
              const fadeSeconds = Math.min(0.3, segmentDuration / 3);
              const fadeIn = clipIndex > 0 ? Math.max(0, 1 - elapsed / fadeSeconds) : 0;
              const fadeOut = clipIndex < clips.length - 1
                ? Math.max(0, 1 - (segmentDuration - elapsed) / fadeSeconds)
                : 0;
              const fadeAlpha = Math.max(fadeIn, fadeOut);
              if (fadeAlpha > 0) {
                context.fillStyle = `rgba(0,0,0,${Math.min(1, fadeAlpha)})`;
                context.fillRect(0, 0, canvas.width, canvas.height);
              }
            }
            drawCaption(context, title, captionPosition, canvas.width, canvas.height);
            onProgress(Math.min(99, Math.round(((renderedSeconds + Math.min(elapsed, segmentDuration)) / totalSeconds) * 100)));
            if (elapsed >= segmentDuration || video.currentTime >= sourceSegmentEnd - 0.02 || video.ended) {
              resolve();
              return;
            }
            requestAnimationFrame(frame);
          };
          frame();
        });
        renderedSeconds += segmentDuration;
      } finally {
        video.pause();
        URL.revokeObjectURL(videoUrl);
      }
    }
    recorder.stop();
    const blob = await completed;
    onProgress(100);
    return { blob, extension: format.extension };
  } catch (reason) {
    if (recorder.state !== "inactive") recorder.stop();
    await completed.catch(() => undefined);
    throw reason;
  } finally {
    outputStream.getTracks().forEach((track) => track.stop());
    if (audioContext?.state !== "closed") await audioContext?.close();
  }
}

async function renderPhotoCollage(files: File[], title: string): Promise<RenderedMedia> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("사진 결과 화면을 만들지 못했습니다.");
  context.fillStyle = "#172c27";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.font = "700 46px sans-serif";
  context.fillText(title.slice(0, 24), 60, 86);
  context.fillStyle = "#b9e6d5";
  context.font = "500 22px sans-serif";
  context.fillText("SCENE JEJU · MOOD MAKER", 60, 126);

  const gap = 18;
  const margin = 54;
  const top = 168;
  const columns = files.length === 1 ? 1 : 2;
  const rows = Math.ceil(files.length / columns);
  const cellWidth = (canvas.width - margin * 2 - gap * (columns - 1)) / columns;
  const cellHeight = (canvas.height - top - 90 - gap * (rows - 1)) / rows;
  for (const [index, file] of files.entries()) {
    const image = new Image();
    image.src = URL.createObjectURL(file);
    await waitForEvent(image, "load");
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawCover(
      context,
      image,
      image.naturalWidth,
      image.naturalHeight,
      margin + column * (cellWidth + gap),
      top + row * (cellHeight + gap),
      cellWidth,
      cellHeight,
    );
    URL.revokeObjectURL(image.src);
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("사진 파일을 만들지 못했습니다.")), "image/jpeg", 0.9);
  });
  return { blob, extension: "jpg" };
}

export default function MediaStudio({ analysis, captureMode }: MediaStudioProps) {
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const [exportExtension, setExportExtension] = useState<RenderedMedia["extension"] | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [caption, setCaption] = useState(`${analysis.place.name} · ${analysis.concept.name}`);
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>("top");
  const [transition, setTransition] = useState<TransitionPreset>("cut");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("environment");
  const [poseRecommendations, setPoseRecommendations] = useState<PoseRecommendationResponse | null>(null);
  const [poseRecommendationMessage, setPoseRecommendationMessage] = useState("컨셉에 맞는 포즈를 고르는 중이에요.");
  const [selectedPoseId, setSelectedPoseId] = useState<string | null>(null);
  const [framing, setFraming] = useState<FramingMode>("full_body");
  const [overlayOpacity, setOverlayOpacity] = useState(0.42);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRef = useRef<LocalMedia[]>([]);
  const exportUrlRef = useRef<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<BlobPart[]>([]);
  const cameraExtensionRef = useRef<"mp4" | "webm">("webm");
  const recordingShouldSaveRef = useRef(true);
  const recordingStartedRef = useRef(0);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const accept = captureMode === "video" ? "video/*" : "image/*";
  const selectedSeconds = captureMode === "video"
    ? media.reduce((sum, item) => sum + editedDuration(item), 0)
    : 0;
  const exportSeconds = Math.min(MAX_EXPORT_SECONDS, selectedSeconds);
  const selectedPose = poseRecommendations?.poses.find((pose) => pose.id === selectedPoseId)
    ?? poseRecommendations?.poses[0]
    ?? null;
  const poseId = selectedPose?.guide_type ?? "open";
  const activePose = POSE_GUIDES.find((pose) => pose.id === poseId) ?? POSE_GUIDES[0];

  function clearRecordingTimers() {
    if (recordingIntervalRef.current !== null) window.clearInterval(recordingIntervalRef.current);
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
    recordingIntervalRef.current = null;
    recordingTimeoutRef.current = null;
  }

  function stopCameraStream(discardRecording = true) {
    const recorder = cameraRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recordingShouldSaveRef.current = !discardRecording;
      recorder.stop();
    }
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    clearRecordingTimers();
    setRecording(false);
    setRecordingSeconds(0);
  }

  useEffect(() => { mediaRef.current = media; }, [media]);
  useEffect(() => { exportUrlRef.current = exportUrl; }, [exportUrl]);
  useEffect(() => {
    setCaption(`${analysis.place.name} · ${analysis.concept.name}`);
  }, [analysis.place.name, analysis.concept.name]);
  useEffect(() => {
    let cancelled = false;
    setPoseRecommendations(null);
    setSelectedPoseId(null);
    setPoseRecommendationMessage("컨셉에 맞는 포즈를 고르는 중이에요.");
    const placeType = (["beach", "forest", "urban", "indoor"] as const)
      .find((value) => value === analysis.place.place_type) ?? "urban";
    const cacheKey = `scene-jeju-pose-v2:${analysis.concept.id}:${placeType}:${captureMode}:${framing}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const recommendations = JSON.parse(cached) as PoseRecommendationResponse;
        setPoseRecommendations(recommendations);
        setSelectedPoseId(recommendations.poses[0].id);
        setPoseRecommendationMessage(
          recommendations.source === "openai"
            ? "이 세션에서 같은 조건으로 받은 AI 추천을 다시 사용했어요."
            : "AI 키가 없어 컨셉별 기본 추천을 보여드려요.",
        );
        return () => { cancelled = true; };
      }
    } catch {
      sessionStorage.removeItem(cacheKey);
    }
    getPoseRecommendations({
      conceptId: analysis.concept.id,
      placeType,
      captureMode,
      framing,
    }).then((recommendations) => {
      if (cancelled) return;
      setPoseRecommendations(recommendations);
      setSelectedPoseId(recommendations.poses[0].id);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(recommendations)); } catch { /* private mode */ }
      setPoseRecommendationMessage(
        recommendations.source === "openai"
          ? "AI가 컨셉을 중심으로 장소와 촬영 방식까지 함께 보고 추천했어요."
          : "AI 키가 없어 컨셉별 기본 추천을 보여드려요.",
      );
    }).catch((reason: unknown) => {
      if (cancelled) return;
      setPoseRecommendationMessage(reason instanceof Error ? reason.message : "포즈 추천을 불러오지 못했어요.");
    });
    return () => { cancelled = true; };
  }, [analysis.concept.id, analysis.place.place_type, captureMode, framing]);
  useEffect(() => () => {
    stopCameraStream(true);
    mediaRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
  }, []);

  useEffect(() => {
    setCameraOpen(false);
    stopCameraStream(true);
    mediaRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    setMedia([]);
    setMessage(null);
    setProgress(0);
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    setExportUrl(null);
    setExportBlob(null);
    setExportExtension(null);
  }, [captureMode]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;

    const connectCamera = async () => {
      try {
        if (!window.isSecureContext) {
          throw new Error("폰에서 포즈 카메라를 쓰려면 HTTPS 주소로 접속해야 해요. 현재 HTTP 주소에서는 폰 기본 카메라를 사용해 주세요.");
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("이 브라우저는 화면 안 카메라를 지원하지 않아요. 최신 Safari 또는 Chrome을 사용해 주세요.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacing },
            width: { ideal: 720, max: 1280 },
            height: { ideal: 1280, max: 1920 },
            aspectRatio: { ideal: 9 / 16 },
          },
          audio: captureMode === "video",
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          await cameraVideoRef.current.play();
        }
        setMessage("선택한 추천 포즈를 반투명 가이드에 맞춰 촬영해 주세요. 가이드선은 결과물에 저장되지 않아요.");
      } catch (reason) {
        if (cancelled) return;
        const denied = reason instanceof DOMException && (reason.name === "NotAllowedError" || reason.name === "SecurityError");
        setMessage(
          denied
            ? "카메라와 마이크 권한이 필요해요. 브라우저 주소창의 권한 설정에서 허용해 주세요."
            : reason instanceof Error ? reason.message : "카메라를 열지 못했습니다.",
        );
        setCameraOpen(false);
      }
    };

    void connectCamera();
    return () => {
      cancelled = true;
      stopCameraStream(true);
    };
  }, [cameraOpen, cameraFacing, captureMode]);

  const clearRenderedResult = (nextMessage: string | null) => {
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(null);
    setExportBlob(null);
    setExportExtension(null);
    setProgress(0);
    setMessage(nextMessage);
  };

  async function appendCapturedFile(file: File, durationHint?: number) {
    if (mediaRef.current.length >= MAX_FILES) {
      setMessage("촬영 결과는 최대 4개까지 담을 수 있어요. 하나를 뺀 뒤 다시 촬영해 주세요.");
      return;
    }
    const url = URL.createObjectURL(file);
    const item: LocalMedia = {
      id: createMediaId(),
      file,
      url,
      duration: 0,
      trimStart: 0,
      trimEnd: 0,
      muted: false,
      speed: 1,
      filter: "none",
      brightness: 100,
      zoom: 1,
      positionX: 0,
      positionY: 0,
    };
    try {
      if (captureMode === "video") {
        try {
          item.duration = await readVideoDuration(url);
        } catch (reason) {
          if (!durationHint || durationHint <= 0) throw reason;
          item.duration = durationHint;
        }
        item.trimEnd = Math.min(item.duration, MAX_EXPORT_SECONDS);
      }
      const next = [...mediaRef.current, item];
      mediaRef.current = next;
      setMedia(next);
      clearRenderedResult(
        captureMode === "video"
          ? `포즈 가이드로 촬영한 ${item.duration.toFixed(1)}초 영상을 편집 목록에 넣었습니다.`
          : "포즈 가이드로 촬영한 사진을 목록에 넣었습니다.",
      );
    } catch (reason) {
      URL.revokeObjectURL(url);
      setMessage(reason instanceof Error ? reason.message : "촬영한 파일을 읽지 못했습니다.");
    }
  }

  async function capturePhoto() {
    const video = cameraVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setMessage("카메라 화면이 준비될 때까지 잠깐 기다려 주세요.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const context = canvas.getContext("2d");
    if (!context) {
      setMessage("사진 촬영 화면을 만들지 못했습니다.");
      return;
    }
    context.save();
    if (cameraFacing === "user") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    drawCover(
      context,
      video,
      video.videoWidth,
      video.videoHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    context.restore();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("사진 파일을 만들지 못했습니다.")),
        "image/jpeg",
        0.92,
      );
    });
    await appendCapturedFile(
      new File([blob], `scene-jeju-camera-${Date.now()}.jpg`, { type: "image/jpeg" }),
    );
  }

  function stopCameraRecording(save = true) {
    const recorder = cameraRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recordingShouldSaveRef.current = save;
    recorder.stop();
    clearRecordingTimers();
  }

  function startCameraRecording() {
    const stream = cameraStreamRef.current;
    if (!stream || !window.MediaRecorder) {
      setMessage("이 브라우저는 웹 화면 안 영상 촬영을 지원하지 않아요. 폰 기본 카메라를 사용해 주세요.");
      return;
    }
    if (mediaRef.current.length >= MAX_FILES) {
      setMessage("영상은 최대 4개까지 담을 수 있어요. 기존 클립을 하나 빼 주세요.");
      return;
    }
    const format = recordingFormat();
    if (!format) {
      setMessage("이 브라우저에서 촬영 영상을 저장할 형식을 찾지 못했습니다.");
      return;
    }
    cameraChunksRef.current = [];
    cameraExtensionRef.current = format.extension;
    recordingShouldSaveRef.current = true;
    const recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 128_000,
    });
    cameraRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size) cameraChunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      clearRecordingTimers();
      setRecording(false);
      setMessage("카메라 영상 녹화 중 오류가 발생했습니다.");
    };
    recorder.onstop = () => {
      const chunks = cameraChunksRef.current;
      const shouldSave = recordingShouldSaveRef.current;
      const extension = cameraExtensionRef.current;
      const recordedDuration = Math.min(15, Math.max(0.1, (performance.now() - recordingStartedRef.current) / 1000));
      cameraChunksRef.current = [];
      cameraRecorderRef.current = null;
      clearRecordingTimers();
      setRecording(false);
      setRecordingSeconds(0);
      if (!shouldSave || !chunks.length) return;
      const blob = new Blob(chunks, { type: format.mimeType });
      void appendCapturedFile(
        new File([blob], `scene-jeju-camera-${Date.now()}.${extension}`, { type: format.mimeType }),
        recordedDuration,
      );
    };
    recorder.start(250);
    recordingStartedRef.current = performance.now();
    setRecording(true);
    setRecordingSeconds(0);
    setMessage("촬영 중이에요. 최대 15초가 되면 자동으로 멈춥니다.");
    recordingIntervalRef.current = window.setInterval(() => {
      setRecordingSeconds(Math.min(15, (performance.now() - recordingStartedRef.current) / 1000));
    }, 100);
    recordingTimeoutRef.current = window.setTimeout(() => stopCameraRecording(true), 15_000);
  }

  const chooseFiles = async (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, MAX_FILES);
    const expectedType = captureMode === "video" ? "video/" : "image/";
    if (selected.some((file) => !file.type.startsWith(expectedType))) {
      setMessage(captureMode === "video" ? "영상 파일만 선택해 주세요." : "사진 파일만 선택해 주세요.");
      return;
    }
    if (selected.some((file) => file.size > MAX_FILE_BYTES)) {
      setMessage("파일 하나의 크기는 150MB 이하여야 합니다.");
      return;
    }
    if (selected.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      setMessage("선택한 파일 전체 크기는 300MB 이하여야 합니다.");
      return;
    }
    const nextMedia: LocalMedia[] = selected.map((file) => ({
      id: createMediaId(),
      file,
      url: URL.createObjectURL(file),
      duration: 0,
      trimStart: 0,
      trimEnd: 0,
      muted: false,
      speed: 1,
      filter: "none",
      brightness: 100,
      zoom: 1,
      positionX: 0,
      positionY: 0,
    }));
    try {
      setMessage(captureMode === "video" ? "클립 길이를 읽는 중이에요." : null);
      if (captureMode === "video") {
        await Promise.all(nextMedia.map(async (item) => {
          const duration = await readVideoDuration(item.url);
          item.duration = duration;
          item.trimEnd = Math.min(duration, MAX_EXPORT_SECONDS);
        }));
      }
      media.forEach((item) => URL.revokeObjectURL(item.url));
      setMedia(nextMedia);
      clearRenderedResult(files.length > MAX_FILES ? "앞의 4개 파일만 가져왔습니다." : null);
    } catch (reason) {
      nextMedia.forEach((item) => URL.revokeObjectURL(item.url));
      setMessage(reason instanceof Error ? reason.message : "영상 정보를 읽지 못했습니다.");
    }
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    [next[index], next[target]] = [next[target], next[index]];
    setMedia(next);
    clearRenderedResult("순서를 바꿨습니다. 결과물을 다시 만들어 주세요.");
  };

  const splitMedia = (index: number) => {
    if (media.length >= MAX_FILES) {
      setMessage("클립은 최대 4개까지라 더 나눌 수 없어요.");
      return;
    }
    const item = media[index];
    const selectedDuration = item.trimEnd - item.trimStart;
    if (selectedDuration < MIN_CLIP_SECONDS * 2) {
      setMessage("1초보다 긴 구간만 두 클립으로 나눌 수 있어요.");
      return;
    }
    const midpoint = item.trimStart + selectedDuration / 2;
    const first = { ...item, trimEnd: midpoint };
    const second = {
      ...item,
      id: createMediaId(),
      url: URL.createObjectURL(item.file),
      trimStart: midpoint,
    };
    const next = [...media];
    next.splice(index, 1, first, second);
    setMedia(next);
    clearRenderedResult("클립을 가운데에서 나눴습니다. 두 구간을 각각 편집할 수 있어요.");
  };

  const removeMedia = (index: number) => {
    URL.revokeObjectURL(media[index].url);
    setMedia(media.filter((_, itemIndex) => itemIndex !== index));
    clearRenderedResult("파일을 뺐습니다. 결과물을 다시 만들어 주세요.");
  };

  const updateTrim = (index: number, edge: "start" | "end", rawValue: number) => {
    setMedia((items) => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (edge === "start") {
        return {
          ...item,
          trimStart: Math.max(0, Math.min(rawValue, item.trimEnd - MIN_CLIP_SECONDS)),
        };
      }
      return {
        ...item,
        trimEnd: Math.min(item.duration, Math.max(rawValue, item.trimStart + MIN_CLIP_SECONDS)),
      };
    }));
    clearRenderedResult("편집 구간을 바꿨습니다. 결과물을 다시 만들어 주세요.");
  };

  const toggleMute = (index: number) => {
    setMedia((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, muted: !item.muted } : item
    )));
    clearRenderedResult("소리 설정을 바꿨습니다. 결과물을 다시 만들어 주세요.");
  };

  const updateClipStyle = (
    index: number,
    update: Partial<Pick<LocalMedia, "speed" | "filter" | "brightness" | "zoom" | "positionX" | "positionY">>,
    messageText = "클립 효과를 바꿨습니다. 결과물을 다시 만들어 주세요.",
  ) => {
    setMedia((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...update } : item
    )));
    clearRenderedResult(messageText);
  };

  const makeResult = async () => {
    setRendering(true);
    setMessage(captureMode === "video" ? "편집한 세로 영상을 만드는 중이에요. 화면을 닫지 마세요." : "사진 결과 이미지를 만드는 중이에요.");
    try {
      const rendered = captureMode === "video"
        ? await renderMontage(media, caption, transition, captionPosition, setProgress)
        : await renderPhotoCollage(media.map((item) => item.file), `${analysis.place.name} · ${analysis.concept.name}`);
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      setExportUrl(URL.createObjectURL(rendered.blob));
      setExportBlob(rendered.blob);
      setExportExtension(rendered.extension);
      setMessage(`${rendered.extension.toUpperCase()} 결과가 완성됐어요. ‘기기에 저장·공유’를 눌러 주세요.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "결과물을 만드는 데 실패했습니다.");
    } finally {
      setRendering(false);
    }
  };

  const saveResult = async () => {
    if (!exportBlob || !exportUrl || !exportExtension) return;
    const filename = `scene-jeju-${Date.now()}.${exportExtension}`;
    const file = new File([exportBlob], filename, { type: exportBlob.type });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${analysis.place.name} 촬영 결과`,
          files: [file],
        });
        setMessage("공유 메뉴에서 ‘파일에 저장’ 또는 원하는 앱을 선택하면 돼요.");
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = exportUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setMessage("저장을 요청했어요. 미리보기 화면이 열리면 Safari 공유 버튼에서 ‘파일에 저장’을 선택해 주세요.");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setMessage("저장 메뉴를 열지 못했습니다. ‘새 화면에서 열기’를 누른 뒤 Safari 공유 버튼을 사용해 주세요.");
    }
  };

  return (
    <article className="media-studio apple-scene">
      <div className="panel-title"><span>{captureMode === "video" ? "REELS EDITOR" : "PHOTO COLLAGE"}</span><small>기기 안에서만 처리</small></div>
      <h3>{captureMode === "video" ? "서비스 안에서 직접 릴스 편집하기" : "촬영한 사진을 한 장으로 만들기"}</h3>
      <p>{captureMode === "video" ? "최대 4개 클립을 나누고 순서를 바꾼 뒤, 배속·색감·밝기·화면 위치·문구·전환 효과를 직접 편집해 최대 15초로 저장할 수 있어요." : "가이드 순서대로 찍은 사진을 최대 4개 골라 주세요. 순서를 바꾸거나 빼고 결과물을 저장할 수 있어요."}</p>
      <section className="concept-pose-recommendations" aria-label="컨셉 맞춤 포즈 추천">
        <div className="concept-pose-heading">
          <div>
            <span>{poseRecommendations?.source === "openai" ? "AI POSE DIRECTOR" : "POSE GUIDE"}</span>
            <h4>{analysis.concept.name} 컨셉에 어울리는 포즈</h4>
          </div>
          <p>{poseRecommendationMessage}</p>
        </div>
        <div className="framing-selector" aria-label="촬영 구도 선택">
          <div>
            <small>촬영 범위</small>
            <strong>어디까지 나오게 찍을까요?</strong>
          </div>
          <div className="framing-choice" role="group" aria-label="전신 또는 상반신">
            {(["full_body", "upper_body"] as FramingMode[]).map((value) => (
              <button
                type="button"
                key={value}
                className={framing === value ? "selected" : ""}
                aria-pressed={framing === value}
                onClick={() => {
                  if (framing === value) return;
                  setCameraOpen(false);
                  setFraming(value);
                }}
              >
                <span>{value === "full_body" ? "전신" : "상반신"}</span>
                <small>{value === "full_body" ? "머리부터 발끝" : "머리부터 허리"}</small>
              </button>
            ))}
          </div>
        </div>
        {poseRecommendations && (
          <>
            <p className="concept-pose-basis">추천 기준 · {poseRecommendations.basis}</p>
            <div className="concept-pose-grid">
              {poseRecommendations.poses.map((pose, index) => (
                <button
                  type="button"
                  key={pose.id}
                  className={selectedPose?.id === pose.id ? "selected" : ""}
                  onClick={() => setSelectedPoseId(pose.id)}
                >
                  <small>추천 {index + 1}</small>
                  <strong>{pose.name}</strong>
                  <span>{pose.one_line}</span>
                  <dl>
                    <div><dt>몸</dt><dd>{pose.body}</dd></div>
                    <div><dt>손</dt><dd>{pose.hands}</dd></div>
                    <div><dt>시선</dt><dd>{pose.gaze}</dd></div>
                    <div><dt>촬영</dt><dd>{pose.camera}</dd></div>
                  </dl>
                  <em>{pose.why}</em>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      <div className="camera-entry-actions">
        <button type="button" className="pose-camera-button" disabled={!selectedPose} onClick={() => setCameraOpen((open) => !open)}>{cameraOpen ? "포즈 카메라 닫기" : selectedPose ? `‘${selectedPose.name}’ 가이드로 찍기` : "추천 포즈 준비 중"}</button>
        <label className="native-camera-button"><input type="file" accept={accept} capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void appendCapturedFile(file); event.currentTarget.value = ""; }} /><span>폰 기본 카메라</span></label>
      </div>
      {cameraOpen && (
        <section className="pose-camera" aria-label="반투명 포즈 가이드 카메라">
          <div className="pose-camera-heading">
            <div><small>선택한 컨셉 맞춤 포즈</small><strong>{selectedPose?.name ?? activePose.label}</strong></div>
            <p>{selectedPose?.one_line ?? activePose.description}</p>
          </div>
          <div className="pose-recommendation-reason">
            <span>왜 어울리나요?</span>
            <p>{selectedPose?.why}</p>
          </div>
          <div className="pose-camera-stage">
            <video ref={cameraVideoRef} className={cameraFacing === "user" ? "mirrored" : ""} autoPlay muted playsInline />
            <PoseOverlay pose={poseId} opacity={overlayOpacity} framing={framing} />
            <span className="ai-pose-score">{framing === "upper_body" ? "상반신" : "전신"} 포즈 가이드</span>
            <span className="pose-safe-line">{selectedPose?.camera}</span>
            {recording && <b className="camera-recording-time"><i /> REC {recordingSeconds.toFixed(1)}s</b>}
          </div>
          <label className="overlay-opacity-control"><span>포즈 가이드 진하기</span><input type="range" min="15" max="80" step="5" value={Math.round(overlayOpacity * 100)} onInput={(event) => setOverlayOpacity(Number(event.currentTarget.value) / 100)} /><strong>{Math.round(overlayOpacity * 100)}%</strong></label>
          <div className="camera-control-row">
            <button type="button" disabled={recording} onClick={() => setCameraFacing((facing) => facing === "environment" ? "user" : "environment")}>↻ 카메라 전환</button>
            {captureMode === "photo"
              ? <button type="button" className="camera-shutter" onClick={() => void capturePhoto()}>● 사진 촬영</button>
              : <button type="button" className={`camera-shutter ${recording ? "recording" : ""}`} onClick={() => recording ? stopCameraRecording(true) : startCameraRecording()}>{recording ? "■ 촬영 끝내기" : "● 영상 촬영"}</button>}
            <button type="button" disabled={recording} onClick={() => setCameraOpen(false)}>닫기</button>
          </div>
          <p className="pose-camera-note">AI 추천에는 컨셉·장소 유형·사진/영상·전신/상반신 정보만 사용합니다. 카메라 영상은 서버나 AI로 전송되지 않고, 반투명 가이드도 촬영 파일에 합성되지 않아요.</p>
        </section>
      )}
      <label className="media-upload"><input type="file" accept={accept} multiple onChange={(event) => { void chooseFiles(event.target.files); event.currentTarget.value = ""; }} /><span>＋ {captureMode === "video" ? "편집할 영상 선택" : "사진 선택"}</span></label>
      {captureMode === "video" && media.length > 0 && (
        <div className="editor-timeline" aria-label="릴스 편집 타임라인">
          <div className="editor-timeline-heading">
            <span>EDITED TIMELINE</span>
            <strong>{formatSeconds(exportSeconds)} / 최대 15초</strong>
          </div>
          <div className="editor-timeline-track">
            {media.map((item, index) => {
              const duration = editedDuration(item);
              return <span key={`${item.id}-timeline`} style={{ flexGrow: Math.max(duration, 0.1) }}>{index + 1}<small>{duration.toFixed(1)}s · {item.speed}×</small></span>;
            })}
          </div>
          {selectedSeconds > MAX_EXPORT_SECONDS && <p>선택 구간이 {formatSeconds(selectedSeconds)}라 15초 이후 부분은 결과에서 제외돼요.</p>}
          <label className="reels-caption-field"><span>영상 위 문구</span><input value={caption} maxLength={30} onChange={(event) => { setCaption(event.target.value); clearRenderedResult(null); }} placeholder="비워두면 문구 없이 저장돼요" /></label>
          <div className="editor-global-options">
            <div><span>문구 위치</span><div className="editor-choice-grid three">{(["top", "center", "bottom"] as CaptionPosition[]).map((position) => <button type="button" key={position} className={captionPosition === position ? "selected" : ""} onClick={() => { setCaptionPosition(position); clearRenderedResult("문구 위치를 바꿨습니다. 결과물을 다시 만들어 주세요."); }}>{position === "top" ? "상단" : position === "center" ? "중앙" : "하단"}</button>)}</div></div>
            <div><span>클립 전환</span><div className="editor-choice-grid">{(["cut", "fade"] as TransitionPreset[]).map((preset) => <button type="button" key={preset} className={transition === preset ? "selected" : ""} onClick={() => { setTransition(preset); clearRenderedResult("전환 효과를 바꿨습니다. 결과물을 다시 만들어 주세요."); }}>{preset === "cut" ? "빠른 컷" : "부드러운 페이드"}</button>)}</div></div>
          </div>
        </div>
      )}
      {media.length > 0 && (
        <div className={`media-preview-grid ${captureMode === "video" ? "video-editor-grid" : ""}`}>
          {media.map((item, index) => (
            <div className="media-preview-item" key={item.id}>
              {captureMode === "video" ? (
                <div className="video-preview-frame">
                  <video
                    src={item.url}
                    muted={item.muted}
                    playsInline
                    controls
                    style={{
                      filter: filterStyle(item),
                      objectPosition: `${50 + item.positionX / 2}% ${50 + item.positionY / 2}%`,
                      transform: `scale(${item.zoom})`,
                    }}
                    onPlay={(event) => {
                      event.currentTarget.playbackRate = item.speed;
                      if (event.currentTarget.currentTime < item.trimStart || event.currentTarget.currentTime >= item.trimEnd) {
                        event.currentTarget.currentTime = item.trimStart;
                      }
                    }}
                    onTimeUpdate={(event) => {
                      if (event.currentTarget.currentTime >= item.trimEnd) event.currentTarget.pause();
                    }}
                  />
                  {caption.trim() && <span className={`preview-caption ${captionPosition}`}>{caption.slice(0, 24)}</span>}
                </div>
              ) : <img src={item.url} alt={`선택한 사진 ${index + 1}`} />}
              <small>{index + 1}. {item.file.name}</small>
              {captureMode === "video" && (
                <div className="clip-editor">
                  <div><span>사용 구간</span><strong>{formatSeconds(item.trimStart)}–{formatSeconds(item.trimEnd)}</strong></div>
                  <label><span>시작</span><input type="range" min="0" max={Math.max(0, item.duration - MIN_CLIP_SECONDS)} step="0.1" value={item.trimStart} onInput={(event) => updateTrim(index, "start", Number(event.currentTarget.value))} /></label>
                  <label><span>끝</span><input type="range" min={Math.min(MIN_CLIP_SECONDS, item.duration)} max={item.duration} step="0.1" value={item.trimEnd} onInput={(event) => updateTrim(index, "end", Number(event.currentTarget.value))} /></label>
                  <div className="clip-tool-group"><span>배속</span><div className="clip-choice-grid speed">{SPEED_OPTIONS.map((speed) => <button type="button" key={speed} className={item.speed === speed ? "selected" : ""} onClick={() => updateClipStyle(index, { speed })}>{speed}×</button>)}</div></div>
                  <div className="clip-tool-group"><span>색감</span><div className="clip-choice-grid filter">{FILTER_OPTIONS.map((option) => <button type="button" key={option.id} className={item.filter === option.id ? "selected" : ""} onClick={() => updateClipStyle(index, { filter: option.id })}>{option.label}</button>)}</div></div>
                  <label className="clip-value-slider"><span>밝기</span><input type="range" min="60" max="140" step="5" value={item.brightness} onInput={(event) => updateClipStyle(index, { brightness: Number(event.currentTarget.value) })} /><strong>{item.brightness}%</strong></label>
                  <label className="clip-value-slider"><span>확대</span><input type="range" min="1" max="1.6" step="0.05" value={item.zoom} onInput={(event) => updateClipStyle(index, { zoom: Number(event.currentTarget.value) })} /><strong>{item.zoom.toFixed(2)}×</strong></label>
                  <label className="clip-value-slider"><span>좌우</span><input type="range" min="-100" max="100" step="5" value={item.positionX} onInput={(event) => updateClipStyle(index, { positionX: Number(event.currentTarget.value) })} /><strong>{item.positionX}</strong></label>
                  <label className="clip-value-slider"><span>상하</span><input type="range" min="-100" max="100" step="5" value={item.positionY} onInput={(event) => updateClipStyle(index, { positionY: Number(event.currentTarget.value) })} /><strong>{item.positionY}</strong></label>
                  <button type="button" onClick={() => splitMedia(index)}>✂ 선택 구간 가운데 나누기</button>
                  <button type="button" className={item.muted ? "muted" : ""} onClick={() => toggleMute(index)}>{item.muted ? "🔇 음소거됨" : "🔊 원본 소리 사용"}</button>
                </div>
              )}
              <div className="media-order-actions">
                <button type="button" disabled={index === 0} onClick={() => moveMedia(index, -1)} aria-label={`${item.file.name} 앞으로 이동`}>←</button>
                <button type="button" disabled={index === media.length - 1} onClick={() => moveMedia(index, 1)} aria-label={`${item.file.name} 뒤로 이동`}>→</button>
                <button type="button" onClick={() => removeMedia(index)} aria-label={`${item.file.name} 삭제`}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {media.length > 0 && <button type="button" className="studio-action" disabled={rendering || (captureMode === "video" && exportSeconds < MIN_CLIP_SECONDS)} onClick={makeResult}>{rendering ? `만드는 중 ${progress}%` : captureMode === "video" ? `편집 영상 만들기 · ${formatSeconds(exportSeconds)}` : "사진 콜라주 만들기"}</button>}
      {message && <p className="studio-message">{message}</p>}
      {exportUrl && exportExtension && (
        <div className="studio-export-actions">
          <button type="button" className="studio-download" onClick={saveResult}>기기에 저장·공유 ({exportExtension.toUpperCase()})</button>
          <a className="studio-open" href={exportUrl} target="_blank" rel="noreferrer">새 화면에서 열기</a>
        </div>
      )}
    </article>
  );
}
