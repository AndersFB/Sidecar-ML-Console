# Server & capability discovery

Part of the [Sidecar ML HTTP API reference](../API.md) — auth, error and
binary-body conventions live there.

### `GET /` *(no auth)*

Service info — what a browser or network scanner sees first.

```bash
curl http://PHONE:8080/
```

```json
{ "app": "Sidecar ML", "capabilities": "/v1/capabilities", "version": "1.0" }
```

**Python:** `phone.info()`

### `GET /health` *(no auth)*

Liveness probe with uptime. It never requires a token, so it is the right
endpoint for reachability checks and monitoring.

```bash
curl http://PHONE:8080/health
```

```json
{ "app": "Sidecar ML", "status": "ok", "uptime_s": 12.5, "version": "1.0" }
```

**Python:** `phone.health()`

### `GET /v1/capabilities`

Every capability with **live** availability — the feature-detection endpoint.
`available: false` always comes with a human-readable `reason` (device not
eligible, model still downloading, language pack missing, …), and `endpoints`
lists the routes the capability serves. Availability is re-checked on every
call, so a capability can flip to `true` after e.g. a model download finishes.

```bash
curl http://PHONE:8080/v1/capabilities
```

```json
[
  {
    "available": false,
    "category": "language",
    "endpoints": ["POST /v1/chat/completions", "GET /v1/models"],
    "id": "chat",
    "name": "Chat (On-Device LLM)",
    "reason": "This device does not support Apple Intelligence.",
    "requires_network": false,
    "summary": "Apple Intelligence's ~3B on-device language model exposed as an OpenAI-compatible chat endpoint with SSE streaming and JSON-schema guided output."
  },
  {
    "available": true,
    "category": "vision",
    "endpoints": ["POST /v1/vision/ocr"],
    "id": "vision-ocr",
    "name": "Text Recognition (OCR)",
    "requires_network": false,
    "summary": "Reads printed and handwritten text from images, with per-line bounding boxes and confidence."
  }
]
```

`reason` is present only when `available` is `false`.

The twelve capability ids, in response order:

| `id` | Category | Endpoints |
|---|---|---|
| `chat` | language | `/v1/chat/completions`, `/v1/models` |
| `vision-ocr` | vision | `/v1/vision/ocr` |
| `vision-analysis` | vision | `/v1/vision/barcodes`, `/v1/vision/classify`, `/v1/vision/feature-print`, `/v1/vision/similarity` |
| `vision-detectors` | vision | `/v1/vision/faces`, `/v1/vision/body-pose`, `/v1/vision/hand-pose`, `/v1/vision/document` |
| `vision-subjects` | vision | `/v1/vision/subject-mask`, `/v1/vision/person-segmentation` |
| `nlp` | text | `/v1/nlp/analyze`, `/v1/nlp/embed`, `/v1/nlp/similarity` |
| `speech-speak` | speech | `/v1/speech/speak`, `/v1/speech/voices` |
| `speech-transcribe` | speech | `/v1/speech/transcribe`, `/v1/speech/transcribe/locales` |
| `sound` | audio | `/v1/sound/classify`, `/v1/sound/labels` |
| `shazam` | audio | `/v1/shazam/match` — the only capability with `requires_network: true` |
| `translation` | language | `/v1/translation/translate`, `/v1/translation/languages` |
| `image-gen` | vision | `/v1/images/generations`, `/v1/images/styles` |

**Python:** `phone.capabilities()`
