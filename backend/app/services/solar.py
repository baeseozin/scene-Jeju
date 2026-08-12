from datetime import datetime
from math import sin, radians
from typing import Literal

import pandas as pd
from pvlib.clearsky import simplified_solis
from pvlib.solarposition import get_solarposition

from ..models import SkyState, SolarResult


def calculate_solar_position(
    latitude: float,
    longitude: float,
    target_time: datetime,
    sky: SkyState = "맑음",
) -> SolarResult:
    if target_time.tzinfo is None:
        raise ValueError("태양 위치 계산 시각에는 timezone이 필요합니다.")

    times = pd.DatetimeIndex([target_time])
    position = get_solarposition(times, latitude, longitude).iloc[0]
    elevation = float(position["apparent_elevation"])
    clear_sky = simplified_solis(elevation)
    clear_ghi = max(0.0, float(clear_sky["ghi"]))
    clear_dni = max(0.0, float(clear_sky["dni"]))
    clear_dhi = max(0.0, float(clear_sky["dhi"]))
    if sky == "맑음":
        ghi, dni, dhi = clear_ghi, clear_dni, clear_dhi
    else:
        # SKY는 운량의 정밀 관측값이 아니므로 보수적인 감쇠계수로 일사량을 추정합니다.
        ghi_factor, dni_factor = (
            (0.65, 0.45) if sky == "구름 많음" else (0.28, 0.08)
        )
        ghi = clear_ghi * ghi_factor
        dni = clear_dni * dni_factor
        direct_horizontal = dni * max(0.0, sin(radians(elevation)))
        dhi = max(0.0, ghi - direct_horizontal)
    return SolarResult(
        elevation=round(elevation, 1),
        azimuth=round(float(position["azimuth"]), 1),
        ghi_wm2=round(ghi),
        dni_wm2=round(dni),
        dhi_wm2=round(dhi),
    )


def add_lighting_risk(
    solar: SolarResult,
    place_type: str,
    shooting_azimuth: float,
    wind_speed_mps: float,
    precipitation_mm: float = 0.0,
) -> SolarResult:
    """장소 표면과 빛의 세기를 이용해 촬영 명암 불균형 위험을 추정합니다.

    창문·나무·건물의 정확한 배치는 알 수 없으므로, 장소 유형별로 흔히 생기는
    문제를 미리 경고하는 지표입니다. 실제 카메라 노출 측정값은 아닙니다.
    """
    if solar.elevation <= -6 or solar.ghi_wm2 < 25:
        return solar.model_copy(
            update={
                "lighting_risk": "높음",
                "lighting_risk_score": 85,
                "lighting_issue": "자연광 부족",
            }
        )
    if solar.elevation <= 0 or solar.ghi_wm2 < 100:
        return solar.model_copy(
            update={
                "lighting_risk": "보통",
                "lighting_risk_score": 50,
                "lighting_issue": "자연광 부족",
            }
        )

    angle_difference = abs((shooting_azimuth - solar.azimuth + 180) % 360 - 180)
    sun_alignment = max(0.0, 1.0 - angle_difference / 90.0)
    direct_light_factor = min(1.0, solar.dni_wm2 / 800.0)
    total_light_factor = min(1.0, solar.ghi_wm2 / 750.0)
    issue = "빛 조건 안정"

    if place_type == "beach":
        height_factor = max(0.15, 1.0 - abs(solar.elevation - 12.0) / 55.0)
        # 바람이 만든 잔물결은 한 점의 반사를 넓은 반짝임 띠로 퍼뜨립니다.
        wave_spread = min(1.0, 0.82 + max(0.0, wind_speed_mps) * 0.025)
        glint_score = 100 * sun_alignment * height_factor * direct_light_factor * wave_spread
        hard_light_score = 42 * direct_light_factor * total_light_factor
        score = round(max(glint_score, hard_light_score))
        issue = "수면 반사와 역광" if glint_score >= 15 else "강한 직사광"
    elif place_type == "forest":
        # 직사광이 수관의 작은 틈을 통과하면 얼굴과 배경에 얼룩진 밝기 차가 생깁니다.
        moving_leaf_factor = min(1.2, 0.9 + max(0.0, wind_speed_mps) * 0.035)
        score = round(82 * direct_light_factor * total_light_factor * moving_leaf_factor)
        issue = "나뭇잎 사이 얼룩 그림자"
    elif place_type == "urban":
        wet_surface_factor = 1.0 if precipitation_mm >= 0.1 else 0.0
        reflection_score = (
            72 * sun_alignment * direct_light_factor
            + 18 * wet_surface_factor * total_light_factor
        )
        shadow_score = 68 * direct_light_factor * total_light_factor
        score = round(max(reflection_score, shadow_score))
        issue = (
            "유리·젖은 노면 반사"
            if wet_surface_factor and reflection_score >= shadow_score
            else "유리·노면 반사"
            if reflection_score >= shadow_score
            else "강한 직사광과 건물 그림자"
        )
    else:
        # 실내 구조와 창 방향은 모르므로 바깥과 실내의 밝기 차가 클 가능성만 표시합니다.
        score = round(72 * total_light_factor * (0.55 + 0.45 * direct_light_factor))
        issue = "창문 역광과 실내외 명암차"

    risk: Literal["낮음", "보통", "높음"]
    if score >= 60:
        risk = "높음"
    elif score >= 25:
        risk = "보통"
    else:
        risk = "낮음"
        issue = "빛 조건 안정"
    return solar.model_copy(
        update={
            "lighting_risk": risk,
            "lighting_risk_score": score,
            "lighting_issue": issue,
        }
    )
