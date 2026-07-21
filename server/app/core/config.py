"""Application settings via pydantic-settings. Never log secret values."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import PROJECT_ROOT, SERVER_ROOT, resolve_sqlite_url, resolve_upload_root


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(SERVER_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./travel_planner.db"
    upload_dir: str = "./uploads"
    secret_key: str = "dev-only-change-me"
    amap_web_service_key: str = ""
    cors_origins: str = "http://localhost:5173"

    @property
    def sqlalchemy_database_url(self) -> str:
        return resolve_sqlite_url(self.database_url)

    @property
    def upload_root(self):
        return resolve_upload_root(self.upload_dir)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def project_root(self):
        return PROJECT_ROOT


@lru_cache
def get_settings() -> Settings:
    return Settings()
