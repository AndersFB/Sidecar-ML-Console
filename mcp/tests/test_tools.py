"""End-to-end tool tests through a real MCP client against the fake phone."""

from __future__ import annotations

import base64
import json

import pytest
from fastmcp.exceptions import ToolError

from . import fake_phone


def _payload(result):
    """The JSON block of a tool result, whether or not media came with it."""
    if result.structured_content is not None:
        return result.structured_content
    for block in reversed(result.content):
        if getattr(block, "text", None):
            payload = json.loads(block.text)
            # A single-element list return serialises as a one-item JSON array.
            if isinstance(payload, list) and len(payload) == 1:
                return payload[0]
            return payload
    raise AssertionError("no JSON block in tool result")


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


async def test_status_reports_capabilities_and_reasons(client):
    payload = _payload(await client.call_tool("sidecar_status"))
    assert payload["status"] == "ok"
    assert "vision-ocr" in payload["available"]
    # The fake phone reports image-gen off, with a reason.
    assert "image-gen" in payload["unavailable"]
    assert "Apple Intelligence" in payload["unavailable"]["image-gen"]


async def test_ocr_returns_text_and_hides_lines_by_default(client, png_bytes):
    payload = _payload(await client.call_tool("ocr_image", {"image": _b64(png_bytes)}))
    assert payload["text"] == "HELLO WORLD"
    assert payload["line_count"] == 1
    assert "lines" not in payload


async def test_ocr_includes_lines_on_request(client, png_bytes):
    payload = _payload(
        await client.call_tool(
            "ocr_image", {"image": _b64(png_bytes), "include_lines": True}
        )
    )
    assert payload["lines"][0]["confidence"] == 0.98


async def test_ocr_sends_the_sniffed_content_type_and_query_params(
    client, png_bytes, phone_state
):
    await client.call_tool(
        "ocr_image",
        {"image": _b64(png_bytes), "level": "fast", "correction": False,
         "languages": "en-US,da"},
    )
    sent = phone_state.received[-1]
    # client.py hardcodes image/jpeg for every image; we send what the bytes are.
    assert sent["content_type"] == "image/png"
    assert sent["query"] == {"level": "fast", "correction": "false",
                             "languages": "en-US,da"}


async def test_file_path_input_works(client, tmp_path, png_bytes):
    path = tmp_path / "photo.png"
    path.write_bytes(png_bytes)
    payload = _payload(await client.call_tool("ocr_image", {"image": str(path)}))
    assert payload["text"] == "HELLO WORLD"


async def test_faces_omits_landmarks_by_default(client, png_bytes):
    payload = _payload(await client.call_tool("detect_faces", {"image": _b64(png_bytes)}))
    assert payload["face_count"] == 1
    assert "landmarks" not in payload["faces"][0]
    assert payload["faces"][0]["yaw_deg"] == 1.5


async def test_faces_includes_landmarks_on_request(client, png_bytes):
    payload = _payload(
        await client.call_tool(
            "detect_faces", {"image": _b64(png_bytes), "include_landmarks": True}
        )
    )
    assert "left_pupil" in payload["faces"][0]["landmarks"]


async def test_pose_drops_low_confidence_joints(client, png_bytes):
    payload = _payload(
        await client.call_tool("detect_body_pose", {"image": _b64(png_bytes)})
    )
    joints = payload["persons"][0]["joints"]
    assert "nose" in joints          # confidence 0.9
    assert "left_ear" not in joints  # confidence 0.02, below the 0.1 default


async def test_embedding_is_summarised_not_dumped(client, png_bytes):
    payload = _payload(
        await client.call_tool("image_embedding", {"image": _b64(png_bytes)})
    )
    assert payload["element_count"] == 768
    assert len(payload["preview"]) == 8
    assert "embedding" not in payload


async def test_embedding_save_path_writes_the_full_vector(client, png_bytes, tmp_path):
    target = tmp_path / "vec.json"
    payload = _payload(
        await client.call_tool(
            "image_embedding", {"image": _b64(png_bytes), "save_path": str(target)}
        )
    )
    assert payload["saved_to"] == str(target)
    assert len(json.loads(target.read_text())["embedding"]) == 768


async def test_remove_background_returns_image_content(client, png_bytes):
    result = await client.call_tool(
        "remove_background", {"image": _b64(png_bytes)}
    )
    kinds = [type(block).__name__ for block in result.content]
    assert "ImageContent" in kinds
    assert _payload(result)["content_type"] == "image/png"


async def test_binary_tools_can_also_save_to_disk(client, png_bytes, tmp_path):
    target = tmp_path / "cutout.png"
    result = await client.call_tool(
        "remove_background", {"image": _b64(png_bytes), "save_path": str(target)}
    )
    assert _payload(result)["saved_to"] == str(target)
    assert target.read_bytes() == fake_phone.PNG


async def test_compare_images_uses_the_base64_json_body(client, png_bytes, phone_state):
    payload = _payload(
        await client.call_tool(
            "compare_images", {"image_a": _b64(png_bytes), "image_b": _b64(png_bytes)}
        )
    )
    assert payload["similarity_hint"] == "near duplicate"
    assert phone_state.received[-1]["content_type"] == "application/json"


async def test_speak_saves_to_disk_and_does_not_inline_audio(client, tmp_path):
    """A few minutes of speech is megabytes — it must not land in the context."""
    target = tmp_path / "hello.wav"
    result = await client.call_tool(
        "speak_text", {"text": "Hello", "save_path": str(target)}
    )
    assert [type(b).__name__ for b in result.content] == ["TextContent"]
    assert _payload(result)["saved_to"] == str(target)
    assert target.exists()


async def test_speak_can_inline_audio_on_request(client, tmp_path):
    result = await client.call_tool(
        "speak_text",
        {"text": "Hello", "save_path": str(tmp_path / "a.wav"), "return_audio": True},
    )
    assert "AudioContent" in [type(b).__name__ for b in result.content]


async def test_transcribe_hides_segments_by_default(client, wav_bytes):
    payload = _payload(
        await client.call_tool("transcribe_audio", {"audio": _b64(wav_bytes)})
    )
    assert payload["text"] == "hello there"
    assert payload["segment_count"] == 1
    assert "segments" not in payload


async def test_translate_flattens_the_response(client):
    payload = _payload(
        await client.call_tool("translate_text", {"text": "hello", "target": "de"})
    )
    assert payload["translations"] == ["[de] hello"]


async def test_translate_supports_batches(client):
    payload = _payload(
        await client.call_tool(
            "translate_text", {"texts": ["a", "b"], "target": "fr"}
        )
    )
    assert payload["translations"] == ["[fr] a", "[fr] b"]


async def test_translate_rejects_both_text_and_texts(client):
    with pytest.raises(ToolError, match="not both"):
        await client.call_tool(
            "translate_text", {"text": "a", "texts": ["b"], "target": "de"}
        )


async def test_sound_classify_hides_the_window_timeline(client, wav_bytes):
    payload = _payload(
        await client.call_tool("classify_sound", {"audio": _b64(wav_bytes)})
    )
    assert payload["top"][0]["label"] == "dog"
    assert "windows" not in payload


async def test_chat_returns_content_and_usage(client):
    payload = _payload(await client.call_tool("phone_chat", {"prompt": "hi"}))
    assert payload["content"] == "Hi from the phone."
    assert payload["usage"]["estimated"] is True


async def test_chat_builds_a_system_message(client, phone_state):
    await client.call_tool("phone_chat", {"prompt": "hi", "system": "Be terse."})
    messages = phone_state.received[-1]["body"]["messages"]
    assert messages[0] == {"role": "system", "content": "Be terse."}


async def test_chat_wraps_a_json_schema(client, phone_state):
    await client.call_tool(
        "phone_chat",
        {"prompt": "hi", "json_schema": {"type": "object", "properties": {}}},
    )
    body = phone_state.received[-1]["body"]
    assert body["response_format"]["type"] == "json_schema"


async def test_none_values_are_omitted_not_sent_as_null(client, phone_state):
    """The API omits absent fields; client.py sends explicit nulls."""
    await client.call_tool("phone_chat", {"prompt": "hi"})
    body = phone_state.received[-1]["body"]
    assert "temperature" not in body
    assert "max_tokens" not in body


async def test_unavailable_capability_is_not_advertised(client):
    """The fake phone reports image-gen off, so its tools must be hidden."""
    names = {tool.name for tool in await client.list_tools()}
    assert "generate_image" not in names
    assert "list_image_styles" not in names
    assert "ocr_image" in names


async def test_call_time_guard_catches_a_host_with_a_stale_tool_list(
    client, phone, phone_state
):
    """Hiding the tool is only half of it — a host may have cached the old list.

    Flip the capability off *after* the tool was advertised, then call it
    anyway. The agent must get the phone's own reason, not a bare 503.
    """
    phone_state.set_available("sound", False, "Sound analysis is off in Settings.")
    phone.invalidate()
    with pytest.raises(ToolError, match="Sound analysis is off in Settings"):
        await client.call_tool("classify_sound", {"audio": _b64(fake_phone.WAV)})


async def test_the_phones_own_503_is_translated_even_without_the_guard(
    client, phone, phone_state, monkeypatch
):
    """If the pre-flight check is bypassed, the HTTP 503 must still read well."""
    from sidecar_ml_mcp.connection import Connection

    phone_state.set_available("sound", False, "Microphone access denied.")
    monkeypatch.setattr(Connection, "require", _skip_guard)
    with pytest.raises(ToolError, match="Microphone access denied"):
        await client.call_tool("classify_sound", {"audio": _b64(fake_phone.WAV)})


async def _skip_guard(self, route: str) -> None:
    return None


async def test_scan_document_returns_image_and_metadata(client, png_bytes):
    result = await client.call_tool("scan_document", {"image": _b64(png_bytes)})
    assert "ImageContent" in [type(b).__name__ for b in result.content]
    payload = _payload(result)
    assert payload["detected"] is True
    assert payload["confidence"] == 0.88


async def test_bad_input_reports_the_phones_error_message(client):
    with pytest.raises(ToolError, match="Expected an image"):
        await client.call_tool("ocr_image", {"image": _b64(fake_phone.WAV)})


# --------------------------------------------------------- voice & face effects


async def test_voice_transform_saves_to_disk_and_does_not_inline_audio(client, tmp_path, wav_bytes):
    """Same reasoning as speak_text — a clip must not land in the context."""
    target = tmp_path / "giant.wav"
    result = await client.call_tool(
        "transform_voice",
        {"audio": _b64(wav_bytes), "preset": "giant", "save_path": str(target)},
    )
    assert [type(b).__name__ for b in result.content] == ["TextContent"]
    payload = _payload(result)
    assert payload["saved_to"] == str(target)
    assert payload["preset"] == "giant"
    assert target.exists()


async def test_voice_transform_forwards_settings_as_query(client, wav_bytes):
    await client.call_tool(
        "transform_voice", {"audio": _b64(wav_bytes), "preset": "giant", "pitch_cents": -500}
    )
    sent = [r for r in fake_phone.state.received if r["path"] == "/v1/voice/transform"][-1]
    assert sent["query"]["preset"] == "giant"
    assert float(sent["query"]["pitch_cents"]) == -500
    # Unset knobs must not be sent at all — the phone would clamp a stray 0.
    assert "reverb" not in sent["query"]


async def test_voice_analyze_returns_the_profile(client, wav_bytes):
    payload = _payload(await client.call_tool("analyze_voice", {"audio": _b64(wav_bytes)}))
    assert payload["median_f0_hz"] == 118.4
    assert payload["voiced_ratio"] == 0.62


async def test_voice_match_summarises_and_says_it_is_not_cloning(client, wav_bytes):
    payload = _payload(
        await client.call_tool(
            "match_voice",
            {"source_audio": _b64(wav_bytes), "target_audio": _b64(wav_bytes)},
        )
    )
    assert payload["parameters"]["pitch_cents"] == 380
    assert "not voice cloning" in payload["note"]
    # Without transform=true there is no rendered clip to report.
    assert "audio" not in payload


async def test_voice_match_saves_the_rendering_when_asked(client, tmp_path, wav_bytes):
    target = tmp_path / "matched.wav"
    payload = _payload(
        await client.call_tool(
            "match_voice",
            {
                "source_audio": _b64(wav_bytes),
                "target_audio": _b64(wav_bytes),
                "transform": True,
                "save_path": str(target),
            },
        )
    )
    assert payload["audio"]["saved_to"] == str(target)
    assert target.exists()


async def test_respeak_returns_the_transcript_with_the_audio(client, tmp_path, wav_bytes):
    payload = _payload(
        await client.call_tool(
            "respeak_audio",
            {"audio": _b64(wav_bytes), "save_path": str(tmp_path / "r.wav")},
        )
    )
    assert payload["text"] == "hello from the phone"
    assert payload["saved_to"].endswith("r.wav")


async def test_face_transform_returns_an_image_and_a_face_count(client, png_bytes):
    result = await client.call_tool("transform_face", {"image": _b64(png_bytes)})
    assert "ImageContent" in [type(b).__name__ for b in result.content]
    payload = _payload(result)
    assert payload["faces"] == 1
    assert "note" not in payload


async def test_face_transform_reports_no_face_as_a_normal_outcome(client, png_bytes):
    """`faces: 0` means the image came back unchanged — not an error."""
    result = await client.call_tool(
        "transform_face", {"image": _b64(png_bytes), "preset": "noface"}
    )
    payload = _payload(result)
    assert payload["faces"] == 0
    assert "No face was found" in payload["note"]


async def test_face_swap_passes_the_server_notes_through(client, png_bytes):
    result = await client.call_tool(
        "swap_faces",
        {"source_image": _b64(png_bytes), "target_image": _b64(png_bytes)},
    )
    payload = _payload(result)
    assert any("not a generative face swap" in note for note in payload["notes"])
    sent = [r for r in fake_phone.state.received if r["path"] == "/v1/face/swap"][-1]
    assert sent["body"]["parameters"]["direction"] == "source_into_target"


async def test_stylize_photo_is_gated_with_image_generation(client):
    """Stylize shares the image-gen id, which the fake phone reports off — so it
    is hidden by the same gating that hides generate_image."""
    names = {tool.name for tool in await client.list_tools()}
    assert "stylize_photo" not in names
    assert "generate_image" not in names
    # The effects tools are backed by available capabilities, so they stay up.
    assert {"transform_voice", "transform_face"} <= names
