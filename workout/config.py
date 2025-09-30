import logging
import os
from dataclasses import dataclass
from typing import Set

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    """Application configuration pulled from environment variables."""

    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    ALLOWED_EXTENSIONS: Set[str] = frozenset({"xlsx"})
    SECRET_KEY: str = os.getenv("FLASK_SECRET_KEY", "")


def validate_env() -> None:
    """Ensure required configuration exists before the app starts."""

    required_vars = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )


def configure_logging(level: int = logging.INFO) -> None:
    """Configure application-wide logging only once."""

    if not logging.getLogger().handlers:
        logging.basicConfig(level=level)
    logging.getLogger(__name__).setLevel(level)
