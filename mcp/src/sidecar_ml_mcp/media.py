"""Media input/output plumbing for the Sidecar ML MCP server.

The phone takes binary either as a raw body with a truthful `Content-Type` or as
base64 inside JSON — there is no multipart. Tools accept a local path, an
http(s) URL or raw base64 for every image/audio argument, and this module turns
any of those into `(bytes, content_type)`.

Content type is sniffed from magic bytes rather than the file extension: the
phone decodes by content type, and a mislabelled body is a decode failure.
"""

from __future__ import annotations

import base64
import binascii
import re
from pathlib import Path
from typing import Literal

import httpx
from fastmcp.exceptions import ToolError

# The phone caps request bodies at 50 MB (413 payload_too_large).
MAX_BYTES = 50 * 1024 * 1024

_DATA_URI = re.compile(r"^data:([\w./+-]+)?;base64,", re.IGNORECASE)
_B64_ALPHABET = frozenset(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
)
# Cheap reject for obviously-not-a-path strings before touching the filesystem.
_MAX_PATH_LEN = 4096

Kind = Literal["image", "audio"]


def _iso_bmff_brand(data: bytes) -> str:
    """Major brand of an ISO base media file (HEIC, M4A, MP4 all share this)."""
    return data[8:12].decode("ascii", "replace").strip().lower() if len(data) >= 12 else ""


def sniff_content_type(data: bytes) -> str | None:
    """Best-effort media type from magic bytes; None when unrecognised."""
    if len(data) < 12:
        return None

    # --- images -----------------------------------------------------------
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if data.startswith((b"II*\x00", b"MM\x00*")):
        return "image/tiff"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"

    # --- audio ------------------------------------------------------------
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "audio/wav"
    if data.startswith(b"fLaC"):
        return "audio/flac"
    if data.startswith(b"caff"):
        return "audio/x-caf"
    if data.startswith(b"FORM") and data[8:12] in (b"AIFF", b"AIFC"):
        return "audio/aiff"
    if data.startswith(b"ID3"):
        return "audio/mpeg"
    # ADTS AAC and bare MP3 frame sync both start 0xFF; check ADTS first.
    if data[0:2] in (b"\xff\xf1", b"\xff\xf9"):
        return "audio/aac"
    if data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return "audio/mpeg"

    # --- ISO base media: HEIC vs M4A/MP4 come down to the brand -----------
    if data[4:8] == b"ftyp":
        brand = _iso_bmff_brand(data)
        if brand in {"heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"}:
            return "image/heic"
        if brand in {"m4a", "m4b", "mp42", "mp41", "isom", "iso2", "qt"}:
            return "audio/mp4"
        if brand in {"avif", "avis"}:
            raise ToolError(
                "AVIF is not one of the phone's supported image formats. "
                "Convert to PNG, JPEG, HEIC, GIF, TIFF or WebP first."
            )

    # --- containers the phone explicitly cannot decode ---------------------
    if data.startswith(b"\x1a\x45\xdf\xa3"):
        raise ToolError(
            "This looks like a WebM/Matroska file. The phone cannot decode "
            "webm/opus audio — convert to WAV, M4A, MP3, AIFF, CAF or FLAC first."
        )
    if data.startswith(b"OggS"):
        raise ToolError(
            "This looks like an Ogg file. The phone cannot decode ogg/opus audio "
            "— convert to WAV, M4A, MP3, AIFF, CAF or FLAC first."
        )
    if data.startswith(b"%PDF"):
        raise ToolError(
            "That is a PDF, not an image. Render the page you want to an image first, "
            "then pass that."
        )
    return None


def _check_size(n: int, source: str) -> None:
    if n > MAX_BYTES:
        raise ToolError(
            f"{source} is {n / 1_048_576:.1f} MB, over the phone's 50 MB request cap. "
            "Downscale the image or trim the audio first."
        )
    if n == 0:
        raise ToolError(f"{source} is empty.")


def _decode_base64(payload: str) -> bytes:
    """Decode tolerantly — real-world base64 arrives wrapped and unpadded.

    Line-wrapped output (MIME, `base64` CLI), the URL-safe alphabet, and missing
    `=` padding are all common enough that strict validation rejects input the
    caller reasonably considers valid.
    """
    cleaned = "".join(payload.split()).replace("-", "+").replace("_", "/")
    if not cleaned:
        raise ValueError("empty payload")
    if any(ch not in _B64_ALPHABET for ch in cleaned):
        raise ValueError("contains characters outside the base64 alphabet")
    cleaned += "=" * (-len(cleaned) % 4)
    return base64.b64decode(cleaned, validate=False)


def _looks_like_path(value: str) -> bool:
    """Guard Path() against multi-megabyte base64 blobs (OSError on long names)."""
    if len(value) > _MAX_PATH_LEN or "\x00" in value:
        return False
    try:
        return Path(value).expanduser().is_file()
    except (OSError, ValueError):
        return False


async def resolve_media(value: str, kind: Kind) -> tuple[bytes, str]:
    """Turn a path, http(s) URL or base64 string into `(bytes, content_type)`.

    Checked in that order — most specific first — so a real file always wins
    over an accidental base64 interpretation of its name.
    """
    if not isinstance(value, str) or not value.strip():
        raise ToolError(f"Missing {kind}. Pass a file path, an http(s) URL, or base64 data.")

    value = value.strip()

    # 1. URL
    if value.lower().startswith(("http://", "https://")):
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as fetch:
                response = await fetch.get(value)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ToolError(f"Could not fetch {kind} from {value}: {exc}") from exc
        data = response.content
        _check_size(len(data), f"The {kind} at {value}")

    # 2. Local file
    elif _looks_like_path(value):
        path = Path(value).expanduser()
        try:
            size = path.stat().st_size
            _check_size(size, f"{path}")
            data = path.read_bytes()
        except OSError as exc:
            raise ToolError(f"Could not read {kind} file {path}: {exc}") from exc

    # 3. base64 (optionally a data: URI)
    else:
        try:
            data = _decode_base64(_DATA_URI.sub("", value))
        except (binascii.Error, ValueError) as exc:
            raise ToolError(
                f"Could not interpret the {kind} argument. Pass one of: a path to an "
                f"existing file, an http(s) URL, or base64-encoded {kind} data. "
                f"(base64 decode failed: {exc})"
            ) from exc
        _check_size(len(data), f"The supplied {kind}")

    content_type = sniff_content_type(data)
    if content_type is None:
        # The phone accepts octet-stream and sniffs server-side.
        return data, "application/octet-stream"

    family = content_type.split("/", 1)[0]
    if kind == "image" and family != "image":
        raise ToolError(f"Expected an image but the data looks like {content_type}.")
    if kind == "audio" and family not in ("audio", "video"):
        raise ToolError(f"Expected audio but the data looks like {content_type}.")
    return data, content_type


def decode_envelope(envelope: dict) -> tuple[bytes, str]:
    """Unpack the phone's binary envelope `{content_type, data_base64, …}`."""
    try:
        return base64.b64decode(envelope["data_base64"]), envelope.get(
            "content_type", "application/octet-stream"
        )
    except (KeyError, binascii.Error, ValueError) as exc:
        raise ToolError(f"Malformed binary response from the phone: {exc}") from exc


def save_bytes(data: bytes, save_path: str) -> str:
    """Write bytes to `save_path`, creating parent directories. Returns the path."""
    path = Path(save_path).expanduser()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    except OSError as exc:
        raise ToolError(f"Could not write to {path}: {exc}") from exc
    return str(path)


def image_format(content_type: str) -> str:
    """MCP `Image(format=…)` wants a bare token, not a media type."""
    return content_type.rsplit("/", 1)[-1].replace("x-", "") or "png"
