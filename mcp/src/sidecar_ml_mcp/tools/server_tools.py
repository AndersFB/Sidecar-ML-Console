"""Connection tools — find a phone, point at it, and report what it can do.

These are never capability-gated: without them there is no route back to a
working phone.
"""

from __future__ import annotations

from fastmcp import FastMCP

from .. import gating
from ..discovery import discover as browse_lan
from ..state import get_connection


def register(mcp: FastMCP) -> None:
    @mcp.tool(tags={"connection"}, annotations={"readOnlyHint": True})
    async def sidecar_discover(timeout: float = 5.0) -> dict:
        """Find Sidecar ML iPhones on the local network via Bonjour.

        Use this when no phone is connected, or when the configured address stops
        responding. Pass a returned url to sidecar_connect.

        The phone only advertises while the app is open and in the foreground —
        iOS suspends network servers in the background.

        Args:
            timeout: Seconds to browse for. 5 is usually enough on a quiet network.
        """
        phones = await browse_lan(timeout)
        return {
            "count": len(phones),
            "phones": phones,
            "hint": (
                "No phones found. Check the iPhone is awake, running Sidecar ML in "
                "the foreground, and on the same Wi-Fi network. You can also pass "
                "its address to sidecar_connect directly."
            )
            if not phones
            else "Pass a url to sidecar_connect to start using one.",
        }

    @mcp.tool(tags={"connection"})
    async def sidecar_connect(base_url: str, token: str | None = None) -> dict:
        """Point this server at a Sidecar ML phone and refresh its capabilities.

        Tools for capabilities the phone cannot run are hidden after connecting,
        so the tool list reflects what this specific device can actually do.

        Args:
            base_url: The phone's address, e.g. "http://192.168.1.20:8080".
            token: Bearer token, if the app has one enabled.
        """
        phone = get_connection()
        await phone.reconnect(base_url, token)
        health = await phone.get("/health")
        result = await gating.apply(mcp, phone)
        return {
            "connected_to": phone.base_url,
            "app": health.get("app"),
            "version": health.get("version"),
            **result,
        }

    @mcp.tool(tags={"connection"}, annotations={"readOnlyHint": True})
    async def sidecar_status() -> dict:
        """Check whether the configured phone is reachable and what it offers.

        Start here — it confirms the connection before any other tool is worth
        calling, and reports which capabilities are unavailable and why.
        """
        phone = get_connection()
        health = await phone.get("/health")
        capabilities = await phone.capabilities()
        return {
            "base_url": phone.base_url,
            "authenticated": phone.token is not None,
            "status": health.get("status"),
            "app": health.get("app"),
            "version": health.get("version"),
            "uptime_s": health.get("uptime_s"),
            "available": sorted(
                c.get("id", "?") for c in capabilities if c.get("available")
            ),
            "unavailable": {
                c.get("id", "?"): c.get("reason", "unavailable")
                for c in capabilities
                if not c.get("available")
            },
        }

    @mcp.tool(tags={"connection"}, annotations={"readOnlyHint": True})
    async def sidecar_capabilities(refresh: bool = False) -> dict:
        """List the phone's capabilities in full, with the reason for any that are off.

        Availability is live — a capability can flip on once a model finishes
        downloading, so pass refresh=true to re-check immediately.

        Args:
            refresh: Bypass the 30-second cache and re-query the phone.
        """
        phone = get_connection()
        capabilities = await phone.capabilities(force=refresh)
        if refresh:
            await gating.try_apply(mcp, phone)
        return {"capabilities": capabilities}
