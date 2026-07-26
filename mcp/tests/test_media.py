"""Media resolution is the most fiddly part of the server, so it gets the most tests."""

from __future__ import annotations

import base64

import pytest
from fastmcp.exceptions import ToolError

from sidecar_ml_mcp.media import (
    MAX_BYTES,
    decode_envelope,
    image_format,
    resolve_media,
    sniff_content_type,
)

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
WAV = b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00" + b"\x00" * 20


@pytest.mark.parametrize(
    "data,expected",
    [
        (PNG, "image/png"),
        (b"\xff\xd8\xff\xe0" + b"\x00" * 16, "image/jpeg"),
        (b"GIF89a" + b"\x00" * 16, "image/gif"),
        (b"II*\x00" + b"\x00" * 16, "image/tiff"),
        (b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 8, "image/webp"),
        (b"\x00\x00\x00\x18ftypheic" + b"\x00" * 8, "image/heic"),
        (WAV, "audio/wav"),
        (b"fLaC" + b"\x00" * 16, "audio/flac"),
        (b"caff" + b"\x00" * 16, "audio/x-caf"),
        (b"FORM\x00\x00\x00\x00AIFF" + b"\x00" * 8, "audio/aiff"),
        (b"ID3\x04" + b"\x00" * 16, "audio/mpeg"),
        (b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 8, "audio/mp4"),
    ],
)
def test_sniffs_every_supported_format(data: bytes, expected: str):
    assert sniff_content_type(data) == expected


def test_rejects_containers_the_phone_cannot_decode():
    # The web console records WAV precisely because of this.
    with pytest.raises(ToolError, match="webm"):
        sniff_content_type(b"\x1a\x45\xdf\xa3" + b"\x00" * 16)
    with pytest.raises(ToolError, match="[Oo]gg"):
        sniff_content_type(b"OggS" + b"\x00" * 16)


def test_unknown_magic_is_not_an_error():
    assert sniff_content_type(b"\x00" * 32) is None


async def test_resolves_a_file_path(tmp_path):
    path = tmp_path / "pixel.png"
    path.write_bytes(PNG)
    data, content_type = await resolve_media(str(path), "image")
    assert data == PNG
    assert content_type == "image/png"


async def test_resolves_base64():
    data, content_type = await resolve_media(base64.b64encode(PNG).decode(), "image")
    assert data == PNG
    assert content_type == "image/png"


async def test_resolves_a_data_uri():
    uri = "data:image/png;base64," + base64.b64encode(PNG).decode()
    data, content_type = await resolve_media(uri, "image")
    assert data == PNG
    assert content_type == "image/png"


async def test_unknown_bytes_fall_back_to_octet_stream():
    payload = base64.b64encode(b"\x00" * 64).decode()
    _, content_type = await resolve_media(payload, "image")
    assert content_type == "application/octet-stream"


async def test_a_real_file_wins_over_a_base64_reading(tmp_path, monkeypatch):
    """A bare filename that also happens to be valid base64 must resolve as a file."""
    path = tmp_path / "abcd"
    path.write_bytes(PNG)
    monkeypatch.chdir(tmp_path)
    data, _ = await resolve_media("abcd", "image")
    assert data == PNG


async def test_rejects_audio_passed_where_an_image_is_expected():
    with pytest.raises(ToolError, match="Expected an image"):
        await resolve_media(base64.b64encode(WAV).decode(), "image")


async def test_rejects_garbage_with_actionable_guidance():
    with pytest.raises(ToolError, match="path to an existing file"):
        await resolve_media("this is not base64 or a path!!", "image")


async def test_rejects_empty_input():
    with pytest.raises(ToolError, match="Missing image"):
        await resolve_media("   ", "image")


async def test_enforces_the_50mb_cap(tmp_path):
    path = tmp_path / "huge.bin"
    path.write_bytes(b"\x00" * (MAX_BYTES + 1))
    with pytest.raises(ToolError, match="50 MB"):
        await resolve_media(str(path), "image")


async def test_long_base64_does_not_crash_the_path_check():
    """Path() on a multi-megabyte string raises OSError on some platforms."""
    blob = base64.b64encode(b"\x00" * 200_000).decode()
    _, content_type = await resolve_media(blob, "image")
    assert content_type == "application/octet-stream"


def test_decode_envelope_round_trip():
    envelope = {"content_type": "image/png", "data_base64": base64.b64encode(PNG).decode()}
    assert decode_envelope(envelope) == (PNG, "image/png")


def test_decode_envelope_reports_malformed_payloads():
    with pytest.raises(ToolError, match="Malformed binary response"):
        decode_envelope({"content_type": "image/png"})


@pytest.mark.parametrize(
    "content_type,expected",
    [("image/png", "png"), ("image/jpeg", "jpeg"), ("audio/x-caf", "caf")],
)
def test_image_format_strips_the_media_type(content_type, expected):
    assert image_format(content_type) == expected
