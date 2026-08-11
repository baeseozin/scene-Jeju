import { useEffect, useRef, useState } from "react";

import type { Analysis, CaptureMode } from "./types";

interface MediaStudioProps {
  analysis: Analysis;
  captureMode: CaptureMode;
}

interface LocalMedia {
  file: File;
  url: string;
}

interface RenderedMedia {
  blob: Blob;
  extension: "mp4" | "webm" | "jpg";
}

const MAX_FILES = 4;
const MAX_FILE_BYTES = 150 * 1024 * 1024;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

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

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
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
  context.drawImage(source, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
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
  files: File[],
  title: string,
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
    const totalSeconds = 15;
    const secondsPerClip = totalSeconds / files.length;
    const startedAt = performance.now();
    for (const file of files) {
      const video = document.createElement("video");
      const videoUrl = URL.createObjectURL(file);
      video.src = videoUrl;
      video.playsInline = true;
      video.loop = true;
      video.preload = "auto";
      try {
        await waitForEvent(video, "loadedmetadata");
        if (audioContext && audioDestination) {
          const source = audioContext.createMediaElementSource(video);
          source.connect(audioDestination);
          video.muted = false;
        } else {
          video.muted = true;
        }
        video.currentTime = 0;
        await video.play();
        const segmentStarted = performance.now();
        await new Promise<void>((resolve) => {
          const frame = () => {
            drawCover(context, video, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height);
            context.fillStyle = "rgba(0,0,0,.32)";
            context.fillRect(0, 0, canvas.width, 72);
            context.fillStyle = "white";
            context.font = "600 18px sans-serif";
            context.fillText(title.slice(0, 22), 20, 43);
            const elapsed = (performance.now() - segmentStarted) / 1000;
            onProgress(Math.min(99, Math.round(((performance.now() - startedAt) / (totalSeconds * 1000)) * 100)));
            if (elapsed >= secondsPerClip) { resolve(); return; }
            requestAnimationFrame(frame);
          };
          frame();
        });
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
  const mediaRef = useRef<LocalMedia[]>([]);
  const exportUrlRef = useRef<string | null>(null);
  const accept = captureMode === "video" ? "video/*" : "image/*";

  useEffect(() => { mediaRef.current = media; }, [media]);
  useEffect(() => { exportUrlRef.current = exportUrl; }, [exportUrl]);
  useEffect(() => () => {
    mediaRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
  }, []);

  useEffect(() => {
    mediaRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    setMedia([]);
    setMessage(null);
    setProgress(0);
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    setExportUrl(null);
    setExportBlob(null);
    setExportExtension(null);
  }, [captureMode]);

  const chooseFiles = (files: FileList | null) => {
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
    media.forEach((item) => URL.revokeObjectURL(item.url));
    setMedia(selected.map((file) => ({ file, url: URL.createObjectURL(file) })));
    setMessage(files.length > MAX_FILES ? "앞의 4개 파일만 가져왔습니다." : null);
    setProgress(0);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(null);
    setExportBlob(null);
    setExportExtension(null);
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    [next[index], next[target]] = [next[target], next[index]];
    setMedia(next);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(null);
    setExportBlob(null);
    setExportExtension(null);
    setMessage("순서를 바꿨습니다. 결과물을 다시 만들어 주세요.");
  };

  const removeMedia = (index: number) => {
    URL.revokeObjectURL(media[index].url);
    setMedia(media.filter((_, itemIndex) => itemIndex !== index));
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(null);
    setExportBlob(null);
    setExportExtension(null);
    setMessage("파일을 뺐습니다. 결과물을 다시 만들어 주세요.");
  };

  const makeResult = async () => {
    setRendering(true);
    setMessage(captureMode === "video" ? "15초 세로 영상을 만드는 중이에요. 화면을 닫지 마세요." : "사진 결과 이미지를 만드는 중이에요.");
    try {
      const rendered = captureMode === "video"
        ? await renderMontage(media.map((item) => item.file), `${analysis.place.name} · ${analysis.concept.name}`, setProgress)
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
      <div className="panel-title"><span>{captureMode === "video" ? "AUTO REELS MAKER" : "PHOTO COLLAGE"}</span><small>기기 안에서만 처리</small></div>
      <h3>{captureMode === "video" ? "촬영한 클립으로 15초 릴스 만들기" : "촬영한 사진을 한 장으로 만들기"}</h3>
      <p>가이드 순서대로 찍은 {captureMode === "video" ? "영상" : "사진"}을 최대 4개 골라 주세요. 순서를 바꾸거나 빼고 결과물을 저장할 수 있어요.</p>
      <label className="media-upload"><input type="file" accept={accept} multiple onChange={(event) => chooseFiles(event.target.files)} /><span>＋ {captureMode === "video" ? "영상 클립 선택" : "사진 선택"}</span></label>
      {media.length > 0 && (
        <div className="media-preview-grid">
          {media.map((item, index) => (
            <div className="media-preview-item" key={`${item.file.name}-${item.file.lastModified}`}>
              {captureMode === "video" ? <video src={item.url} muted playsInline controls /> : <img src={item.url} alt={`선택한 사진 ${index + 1}`} />}
              <small>{index + 1}. {item.file.name}</small>
              <div className="media-order-actions">
                <button type="button" disabled={index === 0} onClick={() => moveMedia(index, -1)} aria-label={`${item.file.name} 앞으로 이동`}>←</button>
                <button type="button" disabled={index === media.length - 1} onClick={() => moveMedia(index, 1)} aria-label={`${item.file.name} 뒤로 이동`}>→</button>
                <button type="button" onClick={() => removeMedia(index)} aria-label={`${item.file.name} 삭제`}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {media.length > 0 && <button type="button" className="studio-action" disabled={rendering} onClick={makeResult}>{rendering ? `만드는 중 ${progress}%` : captureMode === "video" ? "15초 릴스 자동 편집" : "사진 콜라주 만들기"}</button>}
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
