from __future__ import annotations

import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend/public/dolharubang-cutout-v2.png"
OUTPUT = ROOT / "frontend/public/dolharubang-sun-shadow-v4.mp4"
POSTER = ROOT / "frontend/public/dolharubang-sun-shadow-v4-poster.png"

WIDTH = 720
HEIGHT = 1280
FPS = 24
DURATION_SECONDS = 10
SUBJECT_HEIGHT = 690
BACKGROUND = (239, 238, 233, 255)
SHADOW_COLOR = (62, 79, 101)


def sun_position(progress: float) -> tuple[float, float]:
    """Simplified clear-day sun path: east sunrise → high south → west sunset."""
    elevation = 7 + 58 * math.sin(math.pi * progress)
    azimuth = 90 + 180 * progress
    return elevation, azimuth


def shadow_geometry(progress: float) -> tuple[float, float, float]:
    elevation, azimuth = sun_position(progress)

    # L = H / tan(elevation), normalized without clipping. Clipping previously
    # caused the long morning/evening shadow to pause at the maximum length.
    raw_length = 112 / math.tan(math.radians(elevation))
    noon_length = 112 / math.tan(math.radians(65))
    horizon_length = 112 / math.tan(math.radians(7))
    normalized_length = (raw_length - noon_length) / (
        horizon_length - noon_length
    )
    shadow_length = 125 + 230 * normalized_length
    # Sun travels east to west; the ground shadow turns in the opposite direction.
    target_angle = 145 - (azimuth - 90) * (110 / 180)

    # Fade through the invisible sunrise/sunset boundary so the last frame flows
    # into the first without the west shadow jumping back to the east.
    edge = 0.09
    visibility = min(1.0, progress / edge, (1 - progress) / edge)
    visibility = visibility * visibility * (3 - 2 * visibility)
    opacity = (0.24 + 0.05 * math.sin(math.radians(elevation))) * visibility
    return shadow_length, target_angle, opacity


def make_background(progress: float) -> Image.Image:
    # Keep every corner constant. The encoded H.264 edge color is sampled and
    # used as the website background so the video rectangle disappears.
    return Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND)


def make_shadow(
    progress: float,
    base_center: tuple[float, float],
    base_half_width: float,
) -> Image.Image:
    length, target_angle, opacity = shadow_geometry(progress)
    cx, cy = base_center

    # Build one continuous, softly tapered mass. A ground shadow should read as
    # a shadow first; literal facial/arm details make it look like a second object.
    core = Image.new("L", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(core)
    base_width = base_half_width * 1.22
    shoulder_y = cy + length * 0.56
    head_y = cy + length * 0.74
    crown_end = cy + length * 0.98

    draw.polygon(
        [
            (cx - base_width, cy),
            (cx + base_width, cy),
            (cx + base_width * 0.72, shoulder_y),
            (cx + base_width * 0.48, head_y),
            (cx - base_width * 0.48, head_y),
            (cx - base_width * 0.72, shoulder_y),
        ],
        fill=255,
    )
    draw.ellipse(
        (
            cx - base_width * 0.53,
            head_y - length * 0.02,
            cx + base_width * 0.53,
            crown_end,
        ),
        fill=255,
    )
    # The hat brim is only a restrained widening, not a hard horizontal bar.
    draw.rounded_rectangle(
        (
            cx - base_width * 0.63,
            head_y + length * 0.025,
            cx + base_width * 0.63,
            head_y + length * 0.09,
        ),
        radius=max(8, round(length * 0.035)),
        fill=255,
    )

    # Sun shadows lose contrast with distance because of penumbra and ambient light.
    fade = Image.new("L", (1, HEIGHT), 0)
    fade_pixels = fade.load()
    for y in range(max(0, round(cy)), min(HEIGHT, round(cy + length + 1))):
        distance = (y - cy) / max(1, length)
        fade_pixels[0, y] = round(255 * (1 - 0.38 * distance))
    fade = fade.resize((WIDTH, HEIGHT))
    core = Image.fromarray(
        (np.asarray(core, dtype=np.float32) * np.asarray(fade, dtype=np.float32) / 255)
        .clip(0, 255)
        .astype(np.uint8),
        mode="L",
    )

    # Pillow rotates counter-clockwise in screen coordinates. The original mask
    # points down (90°), so this keeps its base fixed while following target_angle.
    rotation = 90 - target_angle
    core = core.rotate(
        rotation,
        center=(cx, cy),
        resample=Image.Resampling.BICUBIC,
    )

    # Two soft passes keep the contact readable without a hard sticker-like edge.
    penumbra = core.filter(ImageFilter.GaussianBlur(17))
    inner = core.filter(ImageFilter.GaussianBlur(9))
    penumbra = penumbra.point(lambda value: round(value * opacity * 0.52))
    inner = inner.point(lambda value: round(value * opacity * 0.48))

    outer_layer = Image.new("RGBA", (WIDTH, HEIGHT), (*SHADOW_COLOR, 0))
    outer_layer.putalpha(penumbra)
    inner_layer = Image.new("RGBA", (WIDTH, HEIGHT), (*SHADOW_COLOR, 0))
    inner_layer.putalpha(inner)
    return Image.alpha_composite(outer_layer, inner_layer)


def prepare_subject() -> tuple[Image.Image, tuple[int, int], tuple[float, float]]:
    source = Image.open(SOURCE).convert("RGBA")
    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("돌하르방 투명 레이어에서 피사체를 찾지 못했습니다.")
    subject = source.crop(bounds)
    ratio = SUBJECT_HEIGHT / subject.height
    subject = subject.resize(
        (round(subject.width * ratio), SUBJECT_HEIGHT), Image.Resampling.LANCZOS
    )
    position = ((WIDTH - subject.width) // 2, 62)
    base_center = (WIDTH / 2, position[1] + subject.height - 8)
    return subject, position, base_center


def render_frame(
    progress: float,
    subject: Image.Image,
    position: tuple[int, int],
    base_center: tuple[float, float],
) -> Image.Image:
    frame = make_background(progress)
    shadow = make_shadow(
        progress,
        base_center,
        subject.width * 0.37,
    )
    frame = Image.alpha_composite(frame, shadow)

    contact = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    contact_mask = Image.new("L", (WIDTH, HEIGHT), 0)
    contact_draw = ImageDraw.Draw(contact_mask)
    contact_draw.ellipse(
        (
            base_center[0] - subject.width * 0.32,
            base_center[1] - 12,
            base_center[0] + subject.width * 0.32,
            base_center[1] + 22,
        ),
        fill=84,
    )
    contact_mask = contact_mask.filter(ImageFilter.GaussianBlur(11))
    contact.putalpha(contact_mask)
    frame = Image.alpha_composite(frame, contact)
    frame.alpha_composite(subject, position)
    return frame.convert("RGB")


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"피사체 레이어가 없습니다: {SOURCE}")

    subject, position, base_center = prepare_subject()
    total_frames = FPS * DURATION_SECONDS
    encoder = subprocess.Popen(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{WIDTH}x{HEIGHT}",
            "-r",
            str(FPS),
            "-i",
            "-",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-color_range",
            "tv",
            "-colorspace",
            "bt709",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-x264-params",
            "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off",
            "-movflags",
            "+faststart",
            "-y",
            str(OUTPUT),
        ],
        stdin=subprocess.PIPE,
    )
    if encoder.stdin is None:
        raise RuntimeError("ffmpeg 입력 스트림을 열지 못했습니다.")

    try:
        for index in range(total_frames):
            # Do not duplicate the first frame at the end of the file. The final
            # almost-invisible sunset frame connects directly to sunrise on loop.
            progress = index / total_frames
            frame = render_frame(
                progress, subject, position, base_center
            )
            encoder.stdin.write(frame.tobytes())
    finally:
        encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError("ffmpeg 영상 인코딩에 실패했습니다.")

    # Extract the poster from the encoded MP4 so its color conversion is exactly
    # the same as the first visible video frame.
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "2.4",
            "-i",
            str(OUTPUT),
            "-frames:v",
            "1",
            "-y",
            str(POSTER),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
