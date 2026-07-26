# Sidecar ML — MCP server

Exposes a [Sidecar ML](../README.md) iPhone's on-device ML API to any MCP-capable
agent: OCR, image classification, barcodes, faces, body/hand pose, document
scanning, background removal, speech-to-text, text-to-speech, offline
translation, NLP, sound classification, song ID, and image generation.

Every capability runs on the phone. The one exception is `identify_song`, which
sends an audio fingerprint to Apple for catalog matching.

## The network constraint

The phone serves on a **LAN address** (`http://<phone-ip>:8080`). This MCP server
must run somewhere that can reach it — your laptop, a box on the same Wi-Fi, or
via a tunnel. A cloud-hosted agent cannot reach a private address directly.

```
agent ──MCP──> sidecar-ml-mcp ──HTTP──> iPhone
               (must be on the phone's network)
```

## Install

```bash
cd mcp
uv venv && uv pip install -e .
```

Or run it without installing:

```bash
uvx --from /path/to/Sidecar-ML-Console/mcp sidecar-ml-mcp
```

## Run

```bash
# stdio — for an agent that spawns the server as a subprocess
sidecar-ml-mcp

# http — for an agent that connects over the network
sidecar-ml-mcp --transport http --port 8765     # → http://127.0.0.1:8765/mcp
```

| Option | Env | Default | Meaning |
|---|---|---|---|
| `--base-url` | `SIDECAR_URL` | `http://127.0.0.1:8080` | The phone's address |
| `--token` | `SIDECAR_TOKEN` | — | Bearer token, if enabled in the app |
| `--timeout` | `SIDECAR_TIMEOUT` | `180` | Per-request timeout (seconds) |
| `--transport` | — | `stdio` | `stdio` or `http` |
| `--host` / `--port` | — | `127.0.0.1` / `8765` | http bind address |
| `--include-tags` | — | — | Only these groups, e.g. `vision,speech` |
| `--exclude-tags` | — | — | Hide these groups |
| `--log-level` | — | `INFO` | Log level (stderr only) |

You do not have to know the phone's address up front — start the server, then
have the agent call `sidecar_discover` (Bonjour) and `sidecar_connect`.

## Client configuration

**stdio:**

```json
{
  "mcpServers": {
    "sidecar-ml": {
      "command": "sidecar-ml-mcp",
      "env": { "SIDECAR_URL": "http://192.168.1.20:8080" }
    }
  }
}
```

**http:**

```json
{
  "mcpServers": {
    "sidecar-ml": { "url": "http://127.0.0.1:8765/mcp" }
  }
}
```

> The http transport has **no authentication of its own**. Keep it bound to
> localhost or a trusted LAN, or put a reverse proxy in front of it.

## Tools

Start with `sidecar_status`. Tools are tagged so `--include-tags` /
`--exclude-tags` can trim the surface.

| Tag | Tools |
|---|---|
| `connection` | `sidecar_status`, `sidecar_discover`, `sidecar_connect`, `sidecar_capabilities` |
| `vision` | `ocr_image`, `read_barcodes`, `classify_image`, `image_embedding`, `compare_images`, `remove_background`, `segment_person`, `detect_faces`, `detect_body_pose`, `detect_hand_pose`, `scan_document` |
| `speech` | `speak_text`, `list_voices`, `transcribe_audio`, `list_transcribe_locales` |
| `text` | `analyze_text`, `embed_text`, `compare_texts`, `translate_text`, `list_translation_languages` |
| `audio` | `classify_sound`, `list_sound_labels`, `identify_song` |
| `image-gen` | `generate_image`, `list_image_styles` |
| `chat` | `phone_chat`, `list_models` |

### Media arguments

Every image and audio argument accepts **any** of:

- a local file path — `/Users/me/receipt.jpg`
- an `http(s)` URL — `https://example.com/receipt.jpg`
- base64 data, with or without a `data:` prefix

Content type is detected from the file's magic bytes, so extensions don't have to
be right. Images: PNG, JPEG, HEIC, GIF, TIFF, WebP. Audio: WAV, M4A/AAC, MP3,
AIFF, CAF, FLAC — WebM/Opus is rejected, because the phone cannot decode it.

Tools that produce media (`generate_image`, `speak_text`, `remove_background`,
`segment_person`, `scan_document`) return native MCP image/audio content, so the
agent can see or hear the result. They all take an optional `save_path` to write
the file to disk as well.

### Capability gating

Not every iPhone can do everything — Apple Intelligence, downloaded translation
pairs and installed speech models all vary by device. On startup and on every
`sidecar_connect`, the server reads `GET /v1/capabilities` and **hides the tools
the phone cannot run**, so the agent is never offered a dead end. If a host
caches the tool list, each tool independently re-checks and fails with the
phone's own explanation.

The server starts fine with no phone reachable — `sidecar_discover` and
`sidecar_connect` stay available so the agent can go find one.

## Notes

- `phone_chat` runs Apple Intelligence's ~3B on-device model. It is much weaker
  than a frontier model — reach for it when the point is that generation stays on
  the device, not for general reasoning.
- Responses are summarised where the raw payload would be enormous: embeddings
  return a preview (use `save_path` for the full vector), OCR returns text unless
  you ask for `include_lines`, faces omit landmarks unless you ask.
- Chat streaming is not exposed — an MCP tool result is a single payload.

## Tests

```bash
uv pip install -e ".[dev]" && .venv/bin/pytest
```

The suite runs fully offline against a mocked phone.
