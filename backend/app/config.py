from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    db_host: str
    db_port: int = 1521
    db_service_name: str
    db_user: str
    db_password: str
    db_owner: str = "U_CMT9GE_WI"
    db_pool_min: int = 1
    db_pool_max: int = 4

    jwt_secret: str
    jwt_expire_minutes: int = 480

    admin_email: str = "admin@h4c.sys"
    # pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex> — gerar com scripts/hash_password.py
    admin_password_hash: str

    cors_origins: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
