import type { Analysis } from "./types";

const STATUS_COLOR = {
  가능: "#62d1ab",
  보통: "#f1a45e",
  비추천: "#ef8582",
} as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
): number {
  const characters = [...text];
  const lines: string[] = [];
  let current = "";
  for (const character of characters) {
    const candidate = current + character;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = character;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

export async function createAnalysisCard(analysis: Analysis): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("공유 이미지를 만들지 못했습니다.");

  const background = context.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#19342d");
  background.addColorStop(0.56, "#0f211d");
  background.addColorStop(1, "#08110f");
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#b9e6d5";
  context.font = "600 25px sans-serif";
  context.letterSpacing = "4px";
  context.fillText("MOOD MAKER · SCENE JEJU", 72, 92);
  context.letterSpacing = "0px";

  context.fillStyle = "#ffffff";
  context.font = "700 63px sans-serif";
  let nextY = drawWrappedText(context, analysis.place.name, 72, 190, 900, 76, 2);
  context.fillStyle = "#a9bdb6";
  context.font = "500 31px sans-serif";
  context.fillText(`${analysis.concept.name} · ${analysis.capture_mode === "video" ? "15초 영상" : "사진"}`, 74, nextY + 8);

  context.fillStyle = "rgba(255,255,255,.08)";
  roundedRect(context, 72, 360, 936, 304, 34);
  context.fillStyle = STATUS_COLOR[analysis.status];
  context.font = "700 37px sans-serif";
  context.fillText(analysis.status, 120, 434);
  context.fillStyle = "#ffffff";
  context.font = "700 154px sans-serif";
  context.fillText(String(analysis.scores.total), 112, 598);
  context.fillStyle = "#82968f";
  context.font = "500 26px sans-serif";
  context.fillText("/ 100", 350, 591);
  context.fillStyle = "#b9e6d5";
  context.font = "600 25px sans-serif";
  context.fillText("추천 촬영 시각", 605, 452);
  context.fillStyle = "#ffffff";
  context.font = "700 35px sans-serif";
  drawWrappedText(context, formatDate(analysis.best_time), 605, 510, 330, 47, 3);

  const cards = [
    ["강수", `${analysis.weather.precipitation_mm} mm`],
    ["바람", `${analysis.weather.wind_speed_mps} m/s`],
    ["하늘", analysis.weather.sky],
    ["태양", `${analysis.solar.elevation}° / ${analysis.solar.azimuth}°`],
  ];
  cards.forEach(([label, value], index) => {
    const x = 72 + (index % 2) * 474;
    const y = 704 + Math.floor(index / 2) * 166;
    context.fillStyle = "rgba(185,230,213,.09)";
    roundedRect(context, x, y, 450, 142, 22);
    context.fillStyle = "#82968f";
    context.font = "500 22px sans-serif";
    context.fillText(label, x + 28, y + 42);
    context.fillStyle = "#ffffff";
    context.font = "700 31px sans-serif";
    context.fillText(value, x + 28, y + 93);
  });

  context.fillStyle = "#b9e6d5";
  context.font = "600 24px sans-serif";
  context.fillText("어디서 찍나요?", 72, 1090);
  context.fillStyle = "#ffffff";
  context.font = "600 34px sans-serif";
  nextY = drawWrappedText(context, analysis.shooting_direction_guide, 72, 1144, 936, 50, 4);

  context.fillStyle = "#b9e6d5";
  context.font = "600 24px sans-serif";
  context.fillText("촬영 순서", 72, nextY + 35);
  let guideY = nextY + 94;
  context.font = "500 27px sans-serif";
  for (const [index, step] of analysis.guide.slice(0, 4).entries()) {
    context.fillStyle = STATUS_COLOR[analysis.status];
    context.font = "700 24px sans-serif";
    context.fillText(String(index + 1).padStart(2, "0"), 72, guideY);
    context.fillStyle = "#e8f0ed";
    context.font = "500 27px sans-serif";
    guideY = drawWrappedText(context, step, 128, guideY, 840, 39, 2) + 22;
  }

  context.fillStyle = "#71867e";
  context.font = "500 20px sans-serif";
  context.fillText("도착 예정 시각의 날씨와 태양 위치를 기준으로 분석한 결과입니다.", 72, 1824);
  context.fillStyle = "#b9e6d5";
  context.font = "700 23px sans-serif";
  context.fillText("분위기는 감으로, 타이밍은 데이터로.", 72, 1865);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("공유 이미지 저장에 실패했습니다.")),
      "image/png",
    );
  });
  return new File([blob], `scene-jeju-${analysis.place.name}.png`, { type: "image/png" });
}
