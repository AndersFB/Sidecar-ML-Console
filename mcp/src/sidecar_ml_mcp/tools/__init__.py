"""Tool registration for the Sidecar ML MCP server."""

from __future__ import annotations

from fastmcp import FastMCP

from . import audio, generation, server_tools, speech, text, vision

MODULES = (server_tools, vision, speech, text, audio, generation)


def register_all(mcp: FastMCP) -> None:
    for module in MODULES:
        module.register(mcp)


__all__ = ["register_all", "MODULES", "audio", "generation", "server_tools", "speech", "text", "vision"]
