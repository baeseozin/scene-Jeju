from datetime import datetime

import pandas as pd
from pvlib.solarposition import get_solarposition

from ..models import SolarResult


def calculate_solar_position(
    latitude: float, longitude: float, target_time: datetime
) -> SolarResult:
    if target_time.tzinfo is None:
        raise ValueError("태양 위치 계산 시각에는 timezone이 필요합니다.")

    times = pd.DatetimeIndex([target_time])
    position = get_solarposition(times, latitude, longitude).iloc[0]
    return SolarResult(
        elevation=round(float(position["apparent_elevation"]), 1),
        azimuth=round(float(position["azimuth"]), 1),
    )

