"""Speech tools — text-to-speech and speech-to-text."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.utilities.types import Audio

from ..media import decode_envelope, resolve_media, save_bytes
from ..state import get_connection

ROUTES = {
    "speak_text": "POST /v1/speech/speak",
    "list_voices": "GET /v1/speech/voices",
    "transcribe_audio": "POST /v1/speech/transcribe",
    "list_transcribe_locales": "GET /v1/speech/transcribe/locales",
}


def register(mcp: FastMCP) -> None:
    @mcp.tool(tags={"speech"}, output_schema=None)
    async def speak_text(
        text: str,
        voice: str | None = None,
        rate: float | None = None,
        pitch: float | None = None,
        save_path: str | None = None,
        return_audio: bool = False,
    ) -> list:
        """Synthesize speech from text on the phone and save it as a WAV file.

        The audio is written to disk and the path returned. It is not inlined
        into the reply by default: a few minutes of speech is megabytes of WAV,
        which would swamp the context for no benefit. Set return_audio=true only
        when the audio genuinely needs to come back inline.

        Args:
            text: The text to speak (up to 5000 characters).
            voice: A voice identifier from list_voices, or a BCP-47 language tag
                like "en-GB". Defaults to the phone's system voice.
            rate: Speaking rate, 0-1 (about 0.5 is normal).
            pitch: Pitch multiplier, 0.5-2 (1 is normal).
            save_path: Where to write the WAV. Defaults to a temporary file.
            return_audio: Also return the audio inline as playable content.
        """
        phone = get_connection()
        await phone.require(ROUTES["speak_text"])
        result = await phone.post_json(
            "/v1/speech/speak",
            {"text": text, "voice": voice, "rate": rate, "pitch": pitch},
        )
        data, content_type = decode_envelope(result)
        target = save_path or str(
            Path(tempfile.gettempdir()) / f"sidecar-speech-{uuid.uuid4().hex[:8]}.wav"
        )
        summary = {
            "saved_to": save_bytes(data, target),
            "bytes": len(data),
            "content_type": content_type,
            "duration_s": result.get("duration_s"),
            "sample_rate": result.get("sample_rate"),
        }
        blocks: list = [{k: v for k, v in summary.items() if v is not None}]
        if return_audio:
            blocks.insert(0, Audio(data=data, format="wav"))
        return blocks

    @mcp.tool(tags={"speech"}, annotations={"readOnlyHint": True})
    async def list_voices() -> dict:
        """List the text-to-speech voices installed on the phone.

        Includes each voice's identifier, language, name and quality tier
        (default / enhanced / premium). Pass an identifier to speak_text.
        """
        phone = get_connection()
        await phone.require(ROUTES["list_voices"])
        return await phone.get("/v1/speech/voices")

    @mcp.tool(tags={"speech"}, annotations={"readOnlyHint": True})
    async def transcribe_audio(
        audio: str,
        locale: str = "en-US",
        download: bool = False,
        include_segments: bool = False,
    ) -> dict:
        """Transcribe spoken audio to text on-device.

        Accepts WAV, M4A/AAC, MP3, AIFF, CAF or FLAC. WebM/Opus is not decodable
        by the phone.

        Args:
            audio: A local file path, an http(s) URL, or base64-encoded audio data.
            locale: BCP-47 locale of the speech, e.g. "en-US", "de-DE".
            download: Allow the phone to download the language model if missing.
            include_segments: Also return per-segment start/end timings.
        """
        phone = get_connection()
        await phone.require(ROUTES["transcribe_audio"])
        data, content_type = await resolve_media(audio, "audio")
        result = await phone.post_raw(
            "/v1/speech/transcribe",
            data,
            content_type,
            {"locale": locale, "download": download},
        )
        segments = result.get("segments", [])
        summary = {
            "text": result.get("text", ""),
            "locale": result.get("locale"),
            "segment_count": len(segments),
        }
        if include_segments:
            summary["segments"] = segments
        return summary

    @mcp.tool(tags={"speech"}, annotations={"readOnlyHint": True})
    async def list_transcribe_locales() -> dict:
        """List transcription locales, split into installed and supported.

        Locales under "supported" but not "installed" need a model download —
        pass download=true to transcribe_audio to fetch one.
        """
        phone = get_connection()
        await phone.require(ROUTES["list_transcribe_locales"])
        return await phone.get("/v1/speech/transcribe/locales")
