"""Audio tools — sound-event classification and song identification."""

from __future__ import annotations

from fastmcp import FastMCP

from ..media import resolve_media
from ..state import get_connection

ROUTES = {
    "classify_sound": "POST /v1/sound/classify",
    "list_sound_labels": "GET /v1/sound/labels",
    "identify_song": "POST /v1/shazam/match",
}


def register(mcp: FastMCP) -> None:
    @mcp.tool(tags={"audio"}, annotations={"readOnlyHint": True})
    async def classify_sound(
        audio: str,
        window: float = 1.5,
        top_k: int = 5,
        include_windows: bool = False,
    ) -> dict:
        """Identify sound events in a recording (~300 classes, e.g. dog, siren).

        Accepts WAV, M4A/AAC, MP3, AIFF, CAF or FLAC.

        Args:
            audio: A local file path, an http(s) URL, or base64-encoded audio data.
            window: Analysis window in seconds, 0.5-15, 50% overlap.
            top_k: Labels to keep per window, 1-20.
            include_windows: Also return the per-window timeline. Verbose for
                long recordings — off by default, which returns only the overall top.
        """
        phone = get_connection()
        await phone.require(ROUTES["classify_sound"])
        data, content_type = await resolve_media(audio, "audio")
        result = await phone.post_raw(
            "/v1/sound/classify",
            data,
            content_type,
            {"window": window, "top_k": top_k},
        )
        windows = result.get("windows", [])
        summary = {
            "duration_s": result.get("duration_s"),
            "top": result.get("top", []),
            "window_count": len(windows),
        }
        if include_windows:
            summary["windows"] = windows
        return summary

    @mcp.tool(tags={"audio"}, annotations={"readOnlyHint": True})
    async def list_sound_labels() -> dict:
        """List every sound class the phone's classifier can emit (~300 labels)."""
        phone = get_connection()
        await phone.require(ROUTES["list_sound_labels"])
        return await phone.get("/v1/sound/labels")

    @mcp.tool(tags={"audio"}, annotations={"readOnlyHint": True, "openWorldHint": True})
    async def identify_song(audio: str) -> dict:
        """Identify a song from a recording, via Shazam.

        The only capability that leaves the device — the audio fingerprint of the
        first ~15 seconds is sent to Apple for catalog matching. Everything else
        in this server runs entirely on the phone.

        Args:
            audio: A local file path, an http(s) URL, or base64-encoded audio data.
        """
        phone = get_connection()
        await phone.require(ROUTES["identify_song"])
        data, content_type = await resolve_media(audio, "audio")
        return await phone.post_raw("/v1/shazam/match", data, content_type)
