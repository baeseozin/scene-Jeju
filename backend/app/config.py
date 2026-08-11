from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "분위기 메이커 API"
    app_mode: Literal["mock", "auto", "real"] = "mock"
    kma_service_key: str = ""
    kakao_rest_api_key: str = ""
    frontend_origin: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", ROOT_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def use_real_weather(self) -> bool:
        return self.app_mode == "real" or (
            self.app_mode == "auto" and bool(self.kma_service_key)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
