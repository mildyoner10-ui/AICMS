from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://aicms:aicms_dev_secret@localhost:5432/aicms"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # MinIO / S3
    storage_backend: str = "local"
    storage_local_path: str = "./.data/docs"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin_secret"
    minio_bucket: str = "aicms-docs"
    minio_use_ssl: bool = False

    # Auth
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expire_minutes: int = 60
    allow_local_login: bool = True

    # OIDC (production)
    oidc_issuer: Optional[str] = None
    oidc_client_id: Optional[str] = None
    oidc_client_secret: Optional[str] = None

    # AI
    ai_provider: str = "mock"
    # "queue" runs reviews on the RQ worker; "inline" runs them in the request (tests/dev).
    review_mode: str = "queue"
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4"

    # AI provider config (any OpenAI-compatible chat completions endpoint)
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key: Optional[str] = None
    ai_model: str = "gpt-4o-mini"
    ai_temperature: float = 0.0
    ai_max_tokens: int = 2000
    ai_timeout_seconds: float = 60.0
    ai_max_documents: int = 10
    ai_max_document_chars: int = 12000

    # Logging
    log_level: str = "DEBUG"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def resolved_ai_key(self) -> Optional[str]:
        return self.ai_api_key or self.openai_api_key


settings = Settings()
