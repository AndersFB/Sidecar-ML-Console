# Sidecar ML — HTTP API reference

Sidecar ML turns an iPhone into a private machine-learning server for your
local network. Every endpoint runs fully on the device — the single exception
is `POST /v1/shazam/match`, which needs internet for catalog matching.

Base URL: `http://<phone-ip>:<port>` (the app shows the exact address; default
port 8080). The phone also advertises itself over Bonjour as
`_sidecarml._tcp` — see [`examples/python/discover.py`](../examples/python/discover.py).

The per-endpoint reference is split by area under [`docs/api/`](api/):

## All endpoints

| Endpoint | Purpose |
|---|---|
| [`GET /`](api/server.md#get-) | Service info (app, version) |
| [`GET /health`](api/server.md#get-health) | Liveness probe with uptime |
| [`GET /v1/capabilities`](api/server.md#get-v1capabilities) | Live capability discovery — what *this* phone can do |
| [`GET /v1/models`](api/chat.md#get-v1models) | OpenAI model list |
| [`POST /v1/chat/completions`](api/chat.md#post-v1chatcompletions) | OpenAI-compatible chat (SSE streaming, JSON-schema output) |
| [`POST /v1/vision/ocr`](api/vision.md#post-v1visionocr) | Text recognition with per-line boxes |
| [`POST /v1/vision/barcodes`](api/vision.md#post-v1visionbarcodes) | QR / EAN / Code128 / … detection |
| [`POST /v1/vision/classify`](api/vision.md#post-v1visionclassify) | ~1000-class image classification |
| [`POST /v1/vision/feature-print`](api/vision.md#post-v1visionfeature-print) | Image embedding vector |
| [`POST /v1/vision/similarity`](api/vision.md#post-v1visionsimilarity) | Distance between two images |
| [`POST /v1/vision/subject-mask`](api/vision.md#post-v1visionsubject-mask) | Background removal (cutout or mask) |
| [`POST /v1/vision/person-segmentation`](api/vision.md#post-v1visionperson-segmentation) | Person mask |
| [`POST /v1/vision/faces`](api/vision.md#post-v1visionfaces) | Face boxes, head angles, landmarks |
| [`POST /v1/vision/body-pose`](api/vision.md#post-v1visionbody-pose) | Body skeleton joints |
| [`POST /v1/vision/hand-pose`](api/vision.md#post-v1visionhand-pose) | Hand joints with chirality |
| [`POST /v1/vision/document`](api/vision.md#post-v1visiondocument) | Document detection + perspective-corrected scan |
| [`POST /v1/images/generations`](api/images.md#post-v1imagesgenerations) | Text-to-image (Image Playground) |
| [`GET /v1/images/styles`](api/images.md#get-v1imagesstyles) | Available generation styles |
| [`POST /v1/speech/speak`](api/speech.md#post-v1speechspeak) | Text-to-speech (WAV) |
| [`GET /v1/speech/voices`](api/speech.md#get-v1speechvoices) | Installed voices |
| [`POST /v1/speech/transcribe`](api/speech.md#post-v1speechtranscribe) | Speech-to-text with timed segments |
| [`GET /v1/speech/transcribe/locales`](api/speech.md#get-v1speechtranscribelocales) | Transcription languages |
| [`GET /v1/translation/languages`](api/translation.md#get-v1translationlanguages) | Translation languages + pair status |
| [`POST /v1/translation/translate`](api/translation.md#post-v1translationtranslate) | Offline translation |
| [`POST /v1/nlp/analyze`](api/nlp.md#post-v1nlpanalyze) | Language, sentiment, entities, tokens |
| [`POST /v1/nlp/embed`](api/nlp.md#post-v1nlpembed) | Sentence embeddings |
| [`POST /v1/nlp/similarity`](api/nlp.md#post-v1nlpsimilarity) | Semantic text distance |
| [`POST /v1/sound/classify`](api/audio.md#post-v1soundclassify) | ~300-class sound events over time |
| [`GET /v1/sound/labels`](api/audio.md#get-v1soundlabels) | Sound class labels |
| [`POST /v1/shazam/match`](api/audio.md#post-v1shazammatch) | Song identification *(needs internet)* |

## Conventions

### Authentication

Auth is off by default. When a bearer token is set in the app, every request
except `GET /` and `GET /health` requires:

```
Authorization: Bearer <token>
```

Anything else answers `401`:

```json
{ "error": { "code": "unauthorized", "message": "Missing or invalid bearer token.", "type": "authentication_error" } }
```

### Sending data

- **JSON bodies** use `Content-Type: application/json` and `snake_case` keys.
  Malformed bodies answer `400` with a pointer to the problem, e.g.
  `Invalid JSON body: missing key 'target'`.
- **Binary inputs** (images, audio) are accepted two ways — there is no
  multipart:
  1. The raw bytes as the request body with a matching content type
     (`Content-Type: image/jpeg`, `audio/wav`, `application/octet-stream`, …).
  2. A JSON body carrying the bytes in base64: `{"image_base64": "…"}` /
     `{"audio_base64": "…"}`.
- **Image formats:** PNG, JPEG, HEIC, GIF, TIFF, WebP. EXIF orientation is
  applied server-side, so returned coordinates always refer to the upright
  image.
- **Audio containers:** WAV, M4A/AAC, MP3, AIFF, CAF, FLAC. Browser-recorded
  webm/opus is **not** decodable — record to WAV (the web console does).
- **Query parameters:** booleans accept `1/true/yes` and `0/false/no`;
  malformed numbers silently fall back to their defaults.
- **Limits:** request bodies are capped at 50 MB (`413 payload_too_large`);
  requests time out after 120 s.

### Receiving data

- Responses are JSON (`application/json; charset=utf-8`) with `snake_case`
  keys in deterministic (sorted) order.
- **Optional fields are omitted, not `null`:** when a value is absent (no
  `reason`, no `sentiment` score, no barcode `payload`, …) the key is left
  out of the response entirely. Treat a missing key as "no value".
- **Binary outputs** (masks, corrected scans, synthesized speech) default to a
  JSON envelope carrying base64 plus metadata:

  ```json
  { "content_type": "image/png", "data_base64": "…", "height": 600, "width": 800 }
  ```

  Send an `Accept` header naming the concrete content type
  (`Accept: image/png`, `audio/wav`, `image/jpeg`) to get the raw bytes with
  that `Content-Type` instead. When the operation cannot produce the binary
  (e.g. no document detected), the response is JSON regardless of `Accept` —
  raw-mode clients should check the response `Content-Type`.
- **Coordinates** are pixels with the origin at the image's top-left corner,
  rounded to one decimal. Image endpoints echo `image: {width, height}` for
  the analyzed image.

### Errors

Every error is the same JSON envelope with a meaningful HTTP status:

```json
{ "error": { "code": "capability_unavailable", "message": "This device does not support Apple Intelligence.", "type": "service_unavailable_error" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | Malformed input: body, query values, undecodable image/audio |
| 400 | `context_length_exceeded` · `content_filter` · `unsupported_language` | Chat-specific rejections |
| 401 | `unauthorized` | Missing or wrong bearer token |
| 404 | `not_found` | Unknown path |
| 405 | `method_not_allowed` | Known path, wrong method |
| 413 | `payload_too_large` | Body exceeds 50 MB |
| 429 | `busy` | The on-device model is rate-limiting |
| 500 | `internal_error` | Unexpected failure |
| 501 | `not_implemented` | e.g. no embedding model for a language |
| 503 | `capability_unavailable` | The capability can't run on this device — `message` says why |

`type` mirrors OpenAI's error families (`invalid_request_error`,
`authentication_error`, `rate_limit_error`, `service_unavailable_error`,
`api_error`) so OpenAI SDK clients surface errors sensibly.

`503 capability_unavailable` is the one to design for: not every phone has
Apple Intelligence, downloaded translation pairs, or installed speech models.
Query [`GET /v1/capabilities`](api/server.md#get-v1capabilities) up front and
show the `reason` the phone reports.

### Concurrency

Heavy models process a bounded number of requests at a time (vision runs two
concurrently; chat, speech, sound, Shazam and image generation one each).
Extra requests queue server-side rather than fail — allow generous client
timeouts. Chat can additionally answer `429 busy` when the on-device model
rate-limits itself.

### CORS

Fully open: `Access-Control-Allow-Origin: *`, including Chrome's Private
Network Access preflight (`Access-Control-Allow-Private-Network: true`).
Browser apps served from `http://localhost` (a secure context) can call the
phone directly — that is how the web console works.

## Clients

- **Python:** [`examples/python/client.py`](../examples/python/client.py)
  wraps every endpoint — `phone = SidecarClient("http://<phone-ip>:8080")`.
  The **Python** one-liners in the per-area pages refer to it. `demo.py` is
  the matching CLI; `fastapi_proxy.py` re-exposes the whole API behind a
  Swagger UI.
- **OpenAI SDKs:** point `base_url` at `http://<phone-ip>:8080/v1` with any
  `api_key` — see [Chat](api/chat.md).
- **Web console:** the in-app API Reference panel documents the same routes
  interactively, with examples pre-filled for your phone's address.
