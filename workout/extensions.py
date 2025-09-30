from __future__ import annotations

from typing import Optional

from flask import Flask, current_app
from supabase import Client, create_client


_SUPABASE_CLIENT: Optional[Client] = None


def init_supabase(app: Flask) -> Client:
    """Initialise and store the Supabase client on the Flask app."""

    global _SUPABASE_CLIENT
    if _SUPABASE_CLIENT is not None:
        return _SUPABASE_CLIENT

    url = app.config.get("SUPABASE_URL")
    key = app.config.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        raise RuntimeError("Supabase configuration is missing required values")

    try:
        _SUPABASE_CLIENT = create_client(url, key)
    except Exception as exc:  # pragma: no cover - network/service failure path
        app.logger.error("Failed to initialize Supabase client: %s", exc)
        raise

    app.extensions["supabase"] = _SUPABASE_CLIENT
    return _SUPABASE_CLIENT


def get_supabase() -> Client:
    """Fetch the Supabase client from the Flask app context."""

    client = current_app.extensions.get("supabase")
    if client is None:
        raise RuntimeError("Supabase client is not initialised")
    return client
