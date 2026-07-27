"""Capability gating — hide tools the connected phone cannot actually run.

The capability list carries `endpoints: ["POST /v1/vision/ocr", …]` per
capability, so the tool→capability mapping is derived from the route each tool
already calls. There is no second table to drift out of sync.

Gating is only half the protection: a host that caches the tool list would still
offer a hidden tool, so every capability-backed tool independently calls
`Connection.require()` and fails with the phone's own reason. This layer is what
keeps the *advertised* list honest.
"""

from __future__ import annotations

from fastmcp import FastMCP
from loguru import logger

from .connection import Connection

# Tools that must never be gated — without them there is no way back to a phone.
ALWAYS_ON = {"sidecar_discover", "sidecar_connect", "sidecar_status", "sidecar_capabilities"}


def tool_routes() -> dict[str, str]:
    """Merged tool-name → "METHOD /path" map across every tool module."""
    from .tools import audio, effects, generation, speech, text, vision

    routes: dict[str, str] = {}
    for module in (vision, speech, text, audio, generation, effects):
        routes.update(module.ROUTES)
    return routes


async def apply(mcp: FastMCP, phone: Connection) -> dict:
    """Enable/disable tools to match the phone's live capabilities.

    Safe to call mid-session: FastMCP applies enable/disable immediately, so a
    client's next tools/list reflects the change.
    """
    routes = tool_routes()
    capabilities = await phone.capabilities(force=True)

    available_routes: set[str] = set()
    blocked: dict[str, str] = {}
    for capability in capabilities:
        for route in capability.get("endpoints", []):
            if capability.get("available", False):
                available_routes.add(route)
            else:
                blocked[route] = capability.get("reason", "unavailable")

    enable = {
        name for name, route in routes.items()
        if route in available_routes or route not in blocked
    }
    disable = {name for name, route in routes.items() if route in blocked} - enable

    if enable:
        mcp.enable(names=enable - ALWAYS_ON)
    if disable:
        mcp.disable(names=disable - ALWAYS_ON)

    unavailable = sorted(
        {c.get("id", "?") for c in capabilities if not c.get("available", False)}
    )
    logger.info(
        f"capabilities: {len(capabilities) - len(unavailable)}/{len(capabilities)} available; "
        f"{len(disable)} tools hidden"
    )
    return {
        "tools_enabled": sorted(enable),
        "tools_hidden": sorted(disable),
        "capabilities_unavailable": unavailable,
    }


async def try_apply(mcp: FastMCP, phone: Connection) -> dict | None:
    """Best-effort gating — never let an unreachable phone stop the server.

    At startup there may be no phone at all; the agent still needs
    sidecar_discover and sidecar_connect to go find one.
    """
    try:
        return await apply(mcp, phone)
    except Exception as exc:
        logger.warning(f"could not read capabilities from {phone.base_url}: {exc}")
        return None
