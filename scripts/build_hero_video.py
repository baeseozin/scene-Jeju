from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend/public/dolharubang-white.mp4"
OUTPUT = ROOT / "frontend/public/dolharubang-steady-v2.mp4"


FILTER = (
    "color=c=0xc7c7c7:s=720x1280:r=24[bg];"
    "color=c=0x728496:s=430x100:r=24,format=rgba,"
    "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
    "a='100*max(0,1-pow((X-W/2)/(W/2),2)-pow((Y-H/2)/(H/2),2))',"
    "gblur=sigma=15[shadow];"
    "[bg][shadow]overlay=145:1060[base];"
    "[0:v]scale=576:1024:flags=lanczos,format=rgba,"
    "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
    "a='255*min(1,min(X/70,(W-1-X)/70))*min(1,Y/35)*min(1,(H-1-Y)/110)'[soft];"
    "[base][soft]overlay=72:96:shortest=1[out]"
)


def main() -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "2",
            "-i",
            str(SOURCE),
            "-filter_complex",
            FILTER,
            "-map",
            "[out]",
            "-an",
            "-r",
            "24",
            "-c:v",
            "libx264",
            "-crf",
            "22",
            "-preset",
            "medium",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-y",
            str(OUTPUT),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
