"""Sidecar ML MCP server — entrypoint, lifespan and CLI.

Exposes a Sidecar ML iPhone's on-device ML API as MCP tools. The module-level
`mcp` object is importable directly, so `fastmcp run server.py:mcp` works
alongside the `sidecar-ml-mcp` console script.
"""

from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator

import typer
from fastmcp import FastMCP
from loguru import logger

from . import gating
from .state import close_connection, init_connection
from .tools import register_all

INSTRUCTIONS = """
Tools for driving a Sidecar ML iPhone — an iPhone on the local network running
on-device machine learning: OCR, image classification, barcode reading, face and
pose detection, document scanning, background removal, speech-to-text,
text-to-speech, offline translation, NLP, sound classification, song
identification, and image generation.

Call sidecar_status first to confirm a phone is reachable. If it is not, use
sidecar_discover to find one on the network, then sidecar_connect.

Everything runs on the phone itself and never leaves the device, with one
exception: identify_song sends an audio fingerprint to Apple for matching.

Every image and audio argument accepts a local file path, an http(s) URL, or
base64 data.
""".strip()

# CLI overrides, consumed by the lifespan below.
_overrides: dict[str, object] = {}


@asynccontextmanager
async def lifespan(server: FastMCP) -> AsyncIterator[None]:
    phone = init_connection(
        base_url=_overrides.get("base_url"),  # type: ignore[arg-type]
        token=_overrides.get("token"),  # type: ignore[arg-type]
        timeout=_overrides.get("timeout"),  # type: ignore[arg-type]
    )
    logger.info(f"Sidecar ML MCP server starting, phone at {phone.base_url}")
    # Best-effort: the server must start even with no phone on the network, or
    # the agent has no way to call sidecar_discover and find one.
    await gating.try_apply(server, phone)
    try:
        yield
    finally:
        await close_connection()


mcp: FastMCP = FastMCP(
    name="sidecar-ml",
    instructions=INSTRUCTIONS,
    lifespan=lifespan,
    version="1.0.0",
)
register_all(mcp)


def configure_logging(transport: str, level: str) -> None:
    """Logs go to stderr, always.

    On stdio, stdout *is* the JSON-RPC channel — a single stray line there
    corrupts the session, so the sink is pinned to stderr rather than left to
    chance.
    """
    logger.remove()
    logger.add(sys.stderr, level=level.upper())


cli = typer.Typer(add_completion=False, help="MCP server for a Sidecar ML iPhone.")


@cli.command()
def main(
    transport: Annotated[
        str, typer.Option(help="stdio for a local agent, http for a networked one.")
    ] = "stdio",
    host: Annotated[str, typer.Option(help="Bind address for http transport.")] = "127.0.0.1",
    port: Annotated[int, typer.Option(help="Port for http transport.")] = 8765,
    base_url: Annotated[
        str | None,
        typer.Option(envvar="SIDECAR_URL", help="Phone address, e.g. http://192.168.1.20:8080."),
    ] = None,
    token: Annotated[
        str | None, typer.Option(envvar="SIDECAR_TOKEN", help="Bearer token, if enabled in the app.")
    ] = None,
    timeout: Annotated[
        float | None,
        typer.Option(envvar="SIDECAR_TIMEOUT", help="Per-request timeout in seconds."),
    ] = None,
    include_tags: Annotated[
        str | None,
        typer.Option(help="Only expose these tag groups, comma-separated, e.g. vision,speech."),
    ] = None,
    exclude_tags: Annotated[
        str | None, typer.Option(help="Hide these tag groups, comma-separated.")
    ] = None,
    log_level: Annotated[str, typer.Option(help="Log level on stderr.")] = "INFO",
) -> None:
    """Run the Sidecar ML MCP server."""
    configure_logging(transport, log_level)
    _overrides.update(
        {k: v for k, v in {"base_url": base_url, "token": token, "timeout": timeout}.items() if v}
    )

    if include_tags:
        keep = {tag.strip() for tag in include_tags.split(",") if tag.strip()}
        mcp.enable(tags=keep | {"connection"}, only=True)
    if exclude_tags:
        drop = {tag.strip() for tag in exclude_tags.split(",") if tag.strip()}
        mcp.disable(tags=drop - {"connection"})

    if transport == "stdio":
        mcp.run(transport="stdio", show_banner=False)
    else:
        logger.info(f"serving MCP over http on http://{host}:{port}/mcp")
        mcp.run(transport=transport, host=host, port=port, show_banner=False)


if __name__ == "__main__":
    cli()
