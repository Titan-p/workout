from __future__ import annotations

import os
from typing import Any

from flask import Flask, Response, request
from .config import Config, configure_logging, validate_env
from .extensions import init_supabase
from .routes import api_bp


def create_app(config: Any | None = None) -> Flask:
    """Application factory used by both local dev and deployment."""

    validate_env()
    configure_logging()

    app = Flask(__name__)

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

    def _apply_cors_headers(response: Response) -> Response:
        if not request.path.startswith("/api/"):
            return response

        allowed_origins = app.config.get(
            "CORS_ALLOW_ORIGINS",
            {"http://localhost:5173", "http://127.0.0.1:5173"},
        )
        if isinstance(allowed_origins, str):
            allowed_origins = {allowed_origins}
        elif isinstance(allowed_origins, (list, tuple, set)):
            allowed_origins = set(allowed_origins)

        origin = request.headers.get("Origin")
        allow_origin = origin if origin in allowed_origins else None

        response.headers["Access-Control-Allow-Origin"] = allow_origin or "http://localhost:5173"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        vary = response.headers.get("Vary")
        response.headers["Vary"] = "Origin" if not vary else f"{vary}, Origin"
        allow_headers = request.headers.get("Access-Control-Request-Headers") or "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Headers"] = allow_headers
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response

    @app.before_request
    def _cors_preflight() -> Response | None:
        if request.method == "OPTIONS" and request.path.startswith("/api/"):
            response = app.make_response(("", 200))
            return _apply_cors_headers(response)
        return None

    @app.after_request
    def _cors_postprocess(response: Response) -> Response:
        return _apply_cors_headers(response)

    app.register_blueprint(api_bp)

    return app
