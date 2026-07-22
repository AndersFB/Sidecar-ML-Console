# Sidecar ML — HTTP API reference

Base URL: `http://<phone-ip>:<port>` (shown in the app; default port 8080).
Everything is JSON with `snake_case` keys. If auth is enabled in the app,
send `Authorization: Bearer <token>` on every request except `GET /` and
`GET /health`.

**Binary inputs** (images/audio) are accepted two ways — no multipart:

1. Raw request body with a content type: `Content-Type: image/jpeg`, `audio/wav`, …
2. JSON body with `"image_base64"` / `"audio_base64"`.

**Binary outputs** default to a JSON envelope `{content_type, data_base64, …}`;
send `Accept: image/png` (or `audio/wav`) to get raw bytes instead.

**Errors** are always `{"error": {"code", "message", "type"}}` with meaningful
HTTP status codes. A capability that can't run on the device answers
`503` with `code: capability_unavailable` and a human-readable reason.

Supported audio containers: WAV, M4A/AAC, MP3, AIFF, CAF, FLAC
(browser-recorded webm/opus is **not** decodable — record to WAV).

---

## Server

### `GET /` *(no auth)*
Service info — what a browser or scanner sees first:
```json
{ "app": "Sidecar ML", "version": "1.0", "capabilities": "/v1/capabilities" }
```

### `GET /health` *(no auth)*
```json
{ "status": "ok", "app": "Sidecar ML", "version": "1.0", "uptime_s": 12.5 }
```

### `GET /v1/capabilities`
Array of every capability with live availability:
```json
[{ "id": "chat", "name": "Chat (On-Device LLM)", "category": "language",
   "summary": "…", "requires_network": false, "available": true,
   "reason": null, "endpoints": ["POST /v1/chat/completions"] }]
```

---

## Chat — OpenAI-compatible

### `GET /v1/models`
OpenAI model list; contains `apple-fm` when Apple Intelligence is available.

### `POST /v1/chat/completions`
OpenAI chat-completions shape. Supported: `messages` (system/user/assistant,
string or text-parts content), `temperature`, `max_tokens` /
`max_completion_tokens`, `stream` (SSE with `chat.completion.chunk` frames and
a final `data: [DONE]`), `response_format` `{"type": "json_object"}` or
`{"type": "json_schema", "json_schema": {"name", "schema"}}` (object / string /
number / integer / boolean / string-enum / array subset → guided generation).
`model` is accepted and ignored. Usage tokens are estimated (`"estimated": true`).

```bash
curl http://PHONE:8080/v1/chat/completions -H 'Content-Type: application/json' -d '{
  "messages": [{"role": "user", "content": "Two-line poem about lighthouses."}]
}'
```

Errors: `400 context_length_exceeded` (~4k-token window), `400 content_filter`
(guardrails), `429 busy`.

---

## Vision

All coordinates are **pixels with the origin at the top-left** of the image
(EXIF orientation is applied server-side). Responses echo `image: {width, height}`.

| Endpoint | Purpose | Options |
|---|---|---|
| `POST /v1/vision/ocr` | Text + per-line `box_px`, confidence | `?level=accurate\|fast&languages=en-US,da&correction=true` |
| `POST /v1/vision/barcodes` | QR/EAN/Code128/… payloads + boxes | `?symbologies=qr,ean13` |
| `POST /v1/vision/classify` | ~1000-class labels | `?top_k=10&min_confidence=0.05` |
| `POST /v1/vision/feature-print` | `{embedding: [float], element_count}` | |
| `POST /v1/vision/similarity` | `{image_a_base64, image_b_base64}` → `{distance, similarity_hint}` (lower = more similar) | |
| `POST /v1/vision/subject-mask` | Background removal → PNG | `?mode=cutout\|mask&crop=true` |
| `POST /v1/vision/person-segmentation` | Person mask → PNG | `?quality=fast\|balanced\|accurate` |
| `POST /v1/vision/faces` | Boxes, roll/yaw/pitch (deg), landmark points per region | |
| `POST /v1/vision/body-pose` | `persons[].joints{name: {x, y, confidence}}` | |
| `POST /v1/vision/hand-pose` | `hands[].chirality + joints` | `?max_hands=2` |
| `POST /v1/vision/document` | Document quad + perspective-corrected scan | `?correct=true&format=png\|jpeg` |

```bash
curl http://PHONE:8080/v1/vision/ocr -H 'Content-Type: image/jpeg' \
     --data-binary @receipt.jpg
```

`/v1/vision/document` extras: `format=png|jpeg` (default `png`; `jpg` also
accepted, anything else → `400`) sets the corrected-scan encoding — JPEG is
typically 5-10x smaller for photographed documents. When `Accept` names the
chosen format's content type, the raw corrected scan replaces the JSON
envelope:

```bash
curl 'http://PHONE:8080/v1/vision/document?format=jpeg' -H 'Content-Type: image/jpeg' \
     -H 'Accept: image/jpeg' --data-binary @paper.jpg -o scan.jpg
```

If no document is detected (or `correct=false`) there is no scan, and the
response is JSON regardless of `Accept` — raw-mode clients should check the
response `Content-Type`.

---

## Image generation (Apple Intelligence required)

### `POST /v1/images/generations`
`{"prompt": "…", "n": 1-4, "style": "animation"|"illustration"|"sketch"}` →
`{"created", "data": [{"b64_json"}]}` (OpenAI images shape).

### `GET /v1/images/styles`
Styles available on this device.

---

## Speech

### `POST /v1/speech/speak`
`{"text", "voice"?: identifier|language, "rate"?: 0-1, "pitch"?: 0.5-2}` →
WAV envelope `{content_type, data_base64, duration_s, sample_rate}`.

### `GET /v1/speech/voices`
All installed voices (incl. Personal Voice when authorized in the app).

### `POST /v1/speech/transcribe`
Audio in; `?locale=en-US` (or JSON `locale`); `{"download": true}` opt-in
fetches a missing language model (slow). Fully on-device →
`{"text", "locale", "segments": [{"text", "start_s", "end_s"}]}`.
`503 asset_not_installed`-style errors tell you when the model needs downloading.

### `GET /v1/speech/transcribe/locales`
`{"supported": [...], "installed": [...]}`.

---

## Translation (offline)

### `GET /v1/translation/languages`
`{"languages": [...]}`; add `?source=en&target=de` for
`pair_status: installed | supported | unsupported`.

### `POST /v1/translation/translate`
`{"text" | "texts": [...], "source"?: "en", "target": "de"}` →
`{"translations": [{"text"}]}`. Pairs must be downloaded on the phone first
(app → Settings → Translation); otherwise `503` with a hint.

---

## Text (NaturalLanguage)

### `POST /v1/nlp/analyze`
`{"text", "features"?: ["language", "sentiment", "entities", "tokens"]}` →
language + hypotheses, sentiment −1…1, entities (`person|place|organization`
with character offsets), tokens with lemma + part of speech.

### `POST /v1/nlp/embed`
`{"texts": [...]}` → `{"embeddings": [[...]], "dimension", "language"}`.

### `POST /v1/nlp/similarity`
`{"text_a", "text_b"}` → `{"distance", "cosine"}`.

---

## Audio analysis

### `POST /v1/sound/classify`
Audio in; `?window=1.5&top_k=5` → `{duration_s, windows: [{start_s, end_s,
classifications}], top}` from the built-in ~300-class classifier.

### `GET /v1/sound/labels`
All class labels.

### `POST /v1/shazam/match` *(needs internet)*
Audio in (~10s is plenty) → `{"matched", "media": {title, artist, album,
apple_music_url, artwork_url, offset_s}}`.

---

## CORS

Fully open (`Access-Control-Allow-Origin: *`), including Chrome's
Private Network Access preflight (`Access-Control-Allow-Private-Network: true`),
so browser apps served from `http://localhost` can call the phone directly.
