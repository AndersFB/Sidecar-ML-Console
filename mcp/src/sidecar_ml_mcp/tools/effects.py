"""Voice and face effects — the `/v1/voice/*` and `/v1/face/*` routes.

Only the one-shot routes get tools. The four streaming routes
(`GET /v1/{voice,face}/{stream,broadcast}`) are deliberately absent: a
WebSocket or a minutes-long MJPEG body has no meaning inside a
request/response tool call, and the phone admits exactly one session per
modality — an agent holding one would lock out the user's own console.
`tests/test_route_coverage.py` records that exclusion explicitly.
"""

from __future__ import annotations

import base64
import tempfile
import uuid
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.utilities.types import Image

from ..media import decode_envelope, image_format, resolve_media, save_bytes
from ..state import get_connection

ROUTES = {
    "list_voice_presets": "GET /v1/voice/presets",
    "transform_voice": "POST /v1/voice/transform",
    "analyze_voice": "POST /v1/voice/analyze",
    "match_voice": "POST /v1/voice/match",
    "respeak_audio": "POST /v1/voice/respeak",
    "list_face_presets": "GET /v1/face/presets",
    "transform_face": "POST /v1/face/transform",
    "swap_faces": "POST /v1/face/swap",
}


def _voice_params(
    preset: str | None,
    pitch_cents: float | None,
    rate: float | None,
    brightness: float | None,
    throat: float | None,
    distortion: float | None,
    reverb: float | None,
    gain_db: float | None,
) -> dict:
    return {
        "preset": preset,
        "pitch_cents": pitch_cents,
        "rate": rate,
        "brightness": brightness,
        "throat": throat,
        "distortion": distortion,
        "reverb": reverb,
        "gain_db": gain_db,
    }


def _save_audio(envelope: dict, save_path: str | None, extra: dict) -> dict:
    """WAV to disk plus a compact summary.

    Audio is never inlined: the same reasoning as `speak_text` — a clip is
    megabytes of base64 that would swamp an agent's context for no benefit.
    """
    data, content_type = decode_envelope(envelope)
    target = save_path or str(
        Path(tempfile.gettempdir()) / f"sidecar-voice-{uuid.uuid4().hex[:8]}.wav"
    )
    summary = {
        "saved_to": save_bytes(data, target),
        "bytes": len(data),
        "content_type": content_type,
        "duration_s": envelope.get("duration_s"),
        "sample_rate": envelope.get("sample_rate"),
    }
    summary.update({k: v for k, v in extra.items() if v is not None})
    return summary


async def _b64(media: str, kind: str) -> str:
    data, _ = await resolve_media(media, kind)
    return base64.b64encode(data).decode()


def register(mcp: FastMCP) -> None:
    # ---------------------------------------------------------------- voice

    @mcp.tool(tags={"voice-fx"}, annotations={"readOnlyHint": True})
    async def list_voice_presets() -> dict:
        """List the voice-changer presets and the effect-preset names it accepts.

        Returns the preset table plus the valid `distortion_preset` and
        `reverb_preset` names — pass one of those to transform_voice rather than
        guessing, since an unknown name is rejected.
        """
        phone = get_connection()
        await phone.require(ROUTES["list_voice_presets"])
        return await phone.get("/v1/voice/presets")

    @mcp.tool(tags={"voice-fx"}, output_schema=None)
    async def transform_voice(
        audio: str,
        preset: str | None = None,
        pitch_cents: float | None = None,
        rate: float | None = None,
        brightness: float | None = None,
        throat: float | None = None,
        distortion: float | None = None,
        reverb: float | None = None,
        gain_db: float | None = None,
        save_path: str | None = None,
    ) -> dict:
        """Change a voice in an audio clip — pitch, timbre and character effects.

        The result is written to disk and the path returned, not inlined.

        Settings layer: `preset` is applied first, then any individual value
        below overrides it. Every number is clamped by the phone, so an
        out-of-range value is corrected rather than rejected.

        Args:
            audio: A local file path, an http(s) URL, or base64-encoded audio.
            preset: A preset id from list_voice_presets, e.g. "giant", "robot".
            pitch_cents: Pitch shift, -2400 to 2400 (±1200 is an octave).
            rate: Speed multiplier, 0.5-2. Also changes the output duration.
            brightness: Spectral tilt, -1 to 1 — negative is chesty, positive nasal.
            throat: Mid-band emphasis, -1 to 1 — thickens or hollows out.
            distortion: Distortion blend, 0-1.
            reverb: Reverb blend, 0-1.
            gain_db: Output trim, -12 to 12.
            save_path: Where to write the WAV. Defaults to a temporary file.
        """
        phone = get_connection()
        await phone.require(ROUTES["transform_voice"])
        data, content_type = await resolve_media(audio, "audio")
        result = await phone.post_raw(
            "/v1/voice/transform",
            data,
            content_type,
            _voice_params(
                preset, pitch_cents, rate, brightness, throat, distortion, reverb, gain_db
            ),
        )
        return _save_audio(result, save_path, {"preset": preset})

    @mcp.tool(tags={"voice-fx"}, annotations={"readOnlyHint": True})
    async def analyze_voice(audio: str) -> dict:
        """Measure the acoustic profile of a voice — pitch register and brightness.

        Returns median/low/high F0, spectral centroid and the voiced ratio.
        A `voiced_ratio` below 0.1 means there was too little voiced speech for
        the pitch estimate to be trusted — say so rather than reporting the
        number as fact.

        Args:
            audio: A local file path, an http(s) URL, or base64-encoded audio.
        """
        phone = get_connection()
        await phone.require(ROUTES["analyze_voice"])
        data, content_type = await resolve_media(audio, "audio")
        return await phone.post_raw("/v1/voice/analyze", data, content_type)

    @mcp.tool(tags={"voice-fx"}, output_schema=None)
    async def match_voice(
        source_audio: str,
        target_audio: str,
        transform: bool = False,
        save_path: str | None = None,
    ) -> dict:
        """Derive the settings that move one voice toward another's register.

        This measures pitch and timbre and returns voice-changer settings — it
        is NOT voice cloning and synthesizes no new identity. Apple ships no
        on-device voice conversion. Describe it that way to the user.

        Feed the returned `parameters` into transform_voice to apply the match
        to other clips.

        Args:
            source_audio: The voice to change — path, http(s) URL, or base64.
            target_audio: The reference voice — path, http(s) URL, or base64.
            transform: Also render the source with the derived settings.
            save_path: Where to write that rendering, when transform is true.
        """
        phone = get_connection()
        await phone.require(ROUTES["match_voice"])
        result = await phone.post_json(
            "/v1/voice/match",
            {
                "source_audio_base64": await _b64(source_audio, "audio"),
                "target_audio_base64": await _b64(target_audio, "audio"),
                "transform": transform,
            },
        )
        summary = {
            "source": result.get("source"),
            "target": result.get("target"),
            "parameters": result.get("parameters"),
            "note": (
                "Matches pitch register and timbre. This is not voice cloning "
                "and synthesizes no new identity."
            ),
        }
        if result.get("audio"):
            summary["audio"] = _save_audio(result["audio"], save_path, {})
        return summary

    @mcp.tool(tags={"voice-fx"}, output_schema=None)
    async def respeak_audio(
        audio: str,
        voice: str | None = None,
        locale: str | None = None,
        save_path: str | None = None,
    ) -> dict:
        """Transcribe a clip and speak it back through a different system voice.

        A genuinely different speaker, at the cost of the original prosody.
        Returns the recognised text plus the path to the new WAV.

        Args:
            audio: A local file path, an http(s) URL, or base64-encoded audio.
            voice: A voice identifier from list_voices, or a BCP-47 language tag.
            locale: Recognition locale, e.g. "en-US". Defaults to the phone's choice.
            save_path: Where to write the WAV. Defaults to a temporary file.
        """
        phone = get_connection()
        await phone.require(ROUTES["respeak_audio"])
        result = await phone.post_json(
            "/v1/voice/respeak",
            {
                "audio_base64": await _b64(audio, "audio"),
                "voice": voice,
                "locale": locale,
            },
        )
        return _save_audio(result, save_path, {"text": result.get("text")})

    # ----------------------------------------------------------------- face

    @mcp.tool(tags={"face-fx"}, annotations={"readOnlyHint": True})
    async def list_face_presets() -> dict:
        """List the face-changer presets, style names and swap directions.

        Pass a `style` from this list to transform_face rather than guessing —
        an unknown name is rejected.
        """
        phone = get_connection()
        await phone.require(ROUTES["list_face_presets"])
        return await phone.get("/v1/face/presets")

    @mcp.tool(tags={"face-fx"}, output_schema=None)
    async def transform_face(
        image: str,
        preset: str | None = None,
        eye_size: float | None = None,
        nose_width: float | None = None,
        mouth_size: float | None = None,
        chin_length: float | None = None,
        face_width: float | None = None,
        swirl: float | None = None,
        smoothing: float | None = None,
        warmth: float | None = None,
        style: str | None = None,
        style_amount: float | None = None,
        mask_to_face: bool | None = None,
        save_path: str | None = None,
    ) -> list:
        """Reshape and restyle the faces in a photo.

        Finding no face is a normal outcome, not a failure: the image comes back
        unchanged with `faces: 0`. Report that as "no face found" rather than as
        an error.

        Settings layer: `preset` first, then any individual value overrides it.
        Every number is clamped by the phone. Geometry controls are signed and
        centred on 0, so 0 is always identity.

        Args:
            image: A local file path, an http(s) URL, or base64-encoded image data.
            preset: A preset id from list_face_presets, e.g. "cartoon", "beauty".
            eye_size: -1 to 1.
            nose_width: -1 to 1.
            mouth_size: -1 to 1.
            chin_length: -1 to 1.
            face_width: -1 to 1.
            swirl: -1 to 1.
            smoothing: Skin smoothing, 0-1.
            warmth: -1 to 1.
            style: A style from list_face_presets, e.g. "comic", "pixellate".
            style_amount: Crossfade to the styled result, 0-1.
            mask_to_face: Keep the background untouched (default true).
            save_path: Optional path to also write the resulting image to disk.
        """
        phone = get_connection()
        await phone.require(ROUTES["transform_face"])
        data, content_type = await resolve_media(image, "image")
        result = await phone.post_raw(
            "/v1/face/transform",
            data,
            content_type,
            {
                "preset": preset,
                "eye_size": eye_size,
                "nose_width": nose_width,
                "mouth_size": mouth_size,
                "chin_length": chin_length,
                "face_width": face_width,
                "swirl": swirl,
                "smoothing": smoothing,
                "warmth": warmth,
                "style": style,
                "style_amount": style_amount,
                "mask_to_face": mask_to_face,
            },
        )
        envelope = result.get("result", {})
        image_data, image_type = decode_envelope(envelope)
        summary = {
            "faces": result.get("faces", 0),
            "image": result.get("image"),
            "bytes": len(image_data),
            "content_type": image_type,
        }
        if result.get("faces", 0) == 0:
            summary["note"] = "No face was found; the image is unchanged."
        if save_path:
            summary["saved_to"] = save_bytes(image_data, save_path)
        return [Image(data=image_data, format=image_format(image_type)), summary]

    @mcp.tool(tags={"face-fx"}, output_schema=None)
    async def swap_faces(
        source_image: str,
        target_image: str,
        direction: str = "source_into_target",
        blend: float | None = None,
        feather: float | None = None,
        color_match: float | None = None,
        save_path: str | None = None,
    ) -> list:
        """Composite one face onto another photo by landmark alignment.

        This warps the EXISTING pixels of one face onto the other's landmarks
        and blends them through a mask. It is NOT a generative face swap and
        synthesizes no new identity — Apple ships no on-device model for that.
        Expect a recognisable but visibly composited result, best when both
        photos share head pose, framing and lighting. The response `notes` say
        this too; pass them on rather than overstating the result.

        Args:
            source_image: Path, http(s) URL, or base64-encoded image data.
            target_image: Path, http(s) URL, or base64-encoded image data.
            direction: "source_into_target" (default) or "target_into_source" —
                which photo donates the face.
            blend: Opacity of the swapped face, 0-1 (default 0.9).
            feather: Mask edge softness, 0-1 (default 0.5).
            color_match: Pull toward the destination's skin tone, 0-1 (default 0.8).
            save_path: Optional path to also write the result to disk.
        """
        phone = get_connection()
        await phone.require(ROUTES["swap_faces"])
        parameters = {
            key: value
            for key, value in {
                "direction": direction,
                "blend": blend,
                "feather": feather,
                "color_match": color_match,
            }.items()
            if value is not None
        }
        result = await phone.post_json(
            "/v1/face/swap",
            {
                "source_image_base64": await _b64(source_image, "image"),
                "target_image_base64": await _b64(target_image, "image"),
                "parameters": parameters,
            },
        )
        image_data, image_type = decode_envelope(result.get("result", {}))
        summary = {
            "image": result.get("image"),
            "bytes": len(image_data),
            "content_type": image_type,
            "notes": result.get("notes", []),
        }
        if save_path:
            summary["saved_to"] = save_bytes(image_data, save_path)
        return [Image(data=image_data, format=image_format(image_type)), summary]
