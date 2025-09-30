from __future__ import annotations

import os
from typing import Any

from flask import Flask

from .config import Config, configure_logging, validate_env
from .extensions import init_supabase
from .routes import api_bp, web_bp

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def create_app(config: Any | None = None) -> Flask:
    """Application factory used by both local dev and deployment."""

    validate_env()
    configure_logging()

    app = Flask(
        __name__,
        template_folder=os.path.join(BASE_DIR, "templates"),
    )

    if config is None:
        app.config["SUPABASE_URL"] = Config.SUPABASE_URL
        app.config["SUPABASE_SERVICE_ROLE_KEY"] = Config.SUPABASE_SERVICE_ROLE_KEY
        app.config["ALLOWED_EXTENSIONS"] = set(Config.ALLOWED_EXTENSIONS)
        secret_key = Config.SECRET_KEY
        if not secret_key:
            secret_key = os.urandom(24).hex()
        app.secret_key = secret_key
    else:
        app.config.update(config)
        if not app.secret_key:
            app.secret_key = os.urandom(24).hex()
        app.config.setdefault("ALLOWED_EXTENSIONS", set(Config.ALLOWED_EXTENSIONS))

    supabase_override = app.config.pop("SUPABASE_CLIENT", None)
    disable_supabase = app.config.pop("DISABLE_SUPABASE", False)

    if supabase_override is not None:
        app.extensions["supabase"] = supabase_override
    elif not disable_supabase:
        init_supabase(app)

    app.register_blueprint(web_bp)
    app.register_blueprint(api_bp)

    return app
