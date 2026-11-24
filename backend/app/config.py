"""Runtime configuration, read from environment variables (see docs/CONFIGURATION.md)."""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Application database (the platform's own PostgreSQL).
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "metrics"
    db_user: str = "metrics_app"
    db_password: str = ""
    db_sslmode: str = "prefer"
    # Full SQLAlchemy URL; overrides the DB_* parts when set.
    database_url: str | None = None

    # Encrypts external data-source passwords at rest. Losing it means
    # re-entering every data-source password.
    secret_encryption_key: str = Field(default="", min_length=0)

    session_hours: int = 12
    cookie_secure: bool = True
    cookie_name: str = "om_session"

    # Bootstrap (run by `python -m app.cli bootstrap`).
    admin_username: str = "admin"
    admin_password: str = ""
    seed_demo: bool = True
    # Optional: register the bundled sample warehouse as an external source.
    sample_source_host: str = ""
    sample_source_port: int = 5432
    sample_source_database: str = "sampledata"
    sample_source_user: str = "metrics_reader"
    sample_source_password: str = ""

    # External source query guards.
    external_statement_timeout_ms: int = 15000
    external_connect_timeout_s: int = 5

    log_level: str = "info"

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        from sqlalchemy.engine import URL

        return URL.create(
            "postgresql+psycopg",
            username=self.db_user,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
            query={"sslmode": self.db_sslmode},
        ).render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
