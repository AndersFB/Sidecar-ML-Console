"""Process-wide handle on the phone we're currently talking to.

The server is single-tenant — one phone at a time, swappable at runtime through
the `sidecar_connect` tool — so a module-level holder is the whole story.
"""

from __future__ import annotations

import os

from fastmcp.exceptions import ToolError

from .connection import DEFAULT_TIMEOUT, Connection

DEFAULT_URL = "http://127.0.0.1:8080"

_connection: Connection | None = None


def init_connection(
    base_url: str | None = None,
    token: str | None = None,
    timeout: float | None = None,
) -> Connection:
    """Create the singleton, falling back to SIDECAR_* environment variables."""
    global _connection
    _connection = Connection(
        base_url=base_url or os.environ.get("SIDECAR_URL") or DEFAULT_URL,
        token=token or os.environ.get("SIDECAR_TOKEN") or None,
        timeout=timeout or float(os.environ.get("SIDECAR_TIMEOUT") or DEFAULT_TIMEOUT),
    )
    return _connection


def get_connection() -> Connection:
    if _connection is None:
        raise ToolError("No phone connection configured. Call sidecar_connect first.")
    return _connection


async def close_connection() -> None:
    global _connection
    if _connection is not None:
        await _connection.aclose()
        _connection = None
