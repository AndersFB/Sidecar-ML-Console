# Voice & face effects

Part of the [Sidecar ML HTTP API reference](../API.md).

Two capabilities that *transform* media rather than describe it — a voice
changer and a face changer — each usable one-shot over a photo or clip, or
live over a stream.

| Capability | `id` | Availability |
|---|---|---|
| Voice Changer | `voice-fx` | Always — the effect chain and analyzer are plain DSP. (`respeak` additionally needs speech models and reports its own `503`.) |
| Face Changer | `face-fx` | Needs CoreML-backed Vision for face landmarks; reports `503 capability_unavailable` where that can't run, the simulator included |

Two framings worth stating plainly, because both endpoints are easy to
misread:

- **`/v1/voice/match` is not voice cloning.** It measures pitch register and
  brightness and derives EQ/pitch settings that move one voice toward another.
  Apple ships no on-device voice conversion.
- **`/v1/face/swap` is not a generative face swap.** It warps the *existing
  pixels* of one face onto another's landmarks and blends them through a mask.
  It synthesizes no new identity.

---

## Voice

Audio in follows the [usual conventions](../API.md#sending-data): raw bytes
with a matching `Content-Type`, or a JSON body with `audio_base64`. Accepted
containers: WAV, M4A/AAC, MP3, AIFF, CAF, FLAC.

### `GET /v1/voice/presets`

The preset table plus the accepted effect-preset names. The app's picker and
this endpoint read the same table, so what you see here is exactly what the
server will accept.

```bash
curl http://PHONE:8080/v1/voice/presets
```

```json
{
  "presets": [
    { "id": "none", "name": "None", "parameters": { … } },
    { "id": "giant", "name": "Giant",
      "parameters": { "pitch_cents": -800, "rate": 0.9, "brightness": -0.55,
                      "throat": 0.5, "reverb": 0.35, "reverb_preset": "largeRoom" } }
  ],
  "distortion_presets": ["multiDecimated1", "multiDecimated2", "…"],
  "reverb_presets": ["smallRoom", "mediumRoom", "largeRoom", "…"]
}
```

Built-in presets: `none`, `deep`, `giant`, `chipmunk`, `child`, `robot`,
`radio`, `alien`, `cavern`, `whisper`.

**Python:** `phone.voice_presets()`

### Voice parameters

One object serves the JSON body, the app's sliders and every preset. Every
numeric field is **clamped on decode**, so an out-of-range number is corrected
rather than rejected, and missing keys fall back to the neutral default — you
can send just `{"pitch_cents": 500}`.

| Field | Range | Notes |
|---|---|---|
| `pitch_cents` | −2400…2400 | ±1200 is an octave |
| `rate` | 0.5…2 | Playback speed; also changes the output duration |
| `brightness` | −1…1 | Spectral tilt — negative darkens (chesty), positive brightens (nasal) |
| `throat` | −1…1 | Mid-band emphasis near 1 kHz — thickens or hollows out |
| `distortion` | 0…1 | Wet/dry blend |
| `distortion_preset` | name | From `distortion_presets`; unknown name → `400` listing the valid ones |
| `reverb` | 0…1 | Wet/dry blend |
| `reverb_preset` | name | From `reverb_presets` |
| `gain_db` | −12…12 | Output trim |

### `POST /v1/voice/transform`

Applies the voice changer to a clip.

Settings resolve in three layers: a named `preset` first, an explicit
`parameters` object replaces it wholesale, then any query field overrides on
top — so `?preset=deep&pitch_cents=-200` works from curl without composing a
JSON body.

| Query | Notes |
|---|---|
| `preset` | Preset id; unknown → `400` listing the valid ids |
| `pitch_cents`, `rate`, `brightness`, `throat`, `distortion`, `reverb`, `gain_db` | Per-field overrides |

```bash
curl 'http://PHONE:8080/v1/voice/transform?preset=giant' \
     -H 'Content-Type: audio/wav' -H 'Accept: audio/wav' \
     --data-binary @clip.wav -o giant.wav
```

Without an `Accept` header naming `audio/wav`, the response is the usual
envelope:

```json
{ "content_type": "audio/wav", "data_base64": "…", "duration_s": 3.2, "sample_rate": 44100 }
```

**Python:** `phone.voice_transform("clip.wav", preset="giant")` → `bytes`

### `POST /v1/voice/analyze`

The acoustic profile of a clip: autocorrelation F0 plus spectral centroid.

```bash
curl http://PHONE:8080/v1/voice/analyze -H 'Content-Type: audio/wav' --data-binary @clip.wav
```

```json
{ "median_f0_hz": 118.4, "f0_low_hz": 96.2, "f0_high_hz": 151.0,
  "spectral_centroid_hz": 1840.5, "voiced_ratio": 0.62,
  "duration_s": 4.1, "sample_rate": 44100 }
```

`median_f0_hz`, `f0_low_hz` and `f0_high_hz` are omitted when the clip has no
usable voiced speech. **`voiced_ratio` below 0.1 means the estimate is not
trustworthy** — a client should say so rather than present the number.

**Python:** `phone.voice_analyze("clip.wav")`

### `POST /v1/voice/match`

Profiles two clips and derives the settings that move the source toward the
target's register and brightness. Two clips in one body, since the binary-body
convention only carries a single payload.

| Body field | Type | Notes |
|---|---|---|
| `source_audio_base64` | string, **required** | The voice to change |
| `target_audio_base64` | string, **required** | The reference voice |
| `transform` | bool | Also return the source rendered with the derived settings |

```bash
curl http://PHONE:8080/v1/voice/match -H 'Content-Type: application/json' -d '{
  "source_audio_base64": "…", "target_audio_base64": "…", "transform": true
}'
```

```json
{ "source": { "median_f0_hz": 118.4, … },
  "target": { "median_f0_hz": 210.7, … },
  "parameters": { "pitch_cents": 380, "brightness": 0.22, … },
  "audio": { "content_type": "audio/wav", "data_base64": "…", "duration_s": 4.1, "sample_rate": 44100 } }
```

`audio` appears only when `transform` was true. Feed `parameters` straight back
into [`/v1/voice/transform`](#post-v1voicetransform) to apply the match to
other clips.

**Python:** `phone.voice_match("me.wav", "reference.wav", transform=True)`

### `POST /v1/voice/respeak`

Transcribes the clip and speaks it back through a different system voice — a
genuinely different speaker, at the cost of the original prosody.

| Body field | Type | Notes |
|---|---|---|
| `audio_base64` | string, **required** | |
| `voice` | string | Identifier or language from [`GET /v1/speech/voices`](speech.md#get-v1speechvoices) |
| `locale` | string | Recognition locale; defaults to the transcriber's own choice |
| `parameters` | object | Voice-changer effects applied *after* synthesis |

```bash
curl http://PHONE:8080/v1/voice/respeak -H 'Content-Type: application/json' -d '{
  "audio_base64": "…", "voice": "com.apple.voice.compact.en-GB.Daniel"
}'
```

```json
{ "content_type": "audio/wav", "data_base64": "…", "duration_s": 2.9,
  "sample_rate": 22050, "text": "what the phone heard" }
```

`text` is the recognised transcript. The raw `Accept: audio/wav` path returns
bytes only, so the transcript is **JSON-path-only** by design. Silence answers
`400` — there was nothing to re-speak.

**Python:** `phone.voice_respeak("clip.wav", voice="…")`

---

## Face

Image in follows the [usual conventions](../API.md#sending-data): raw bytes or
`image_base64`. PNG, JPEG, HEIC, GIF, TIFF and WebP.

### `GET /v1/face/presets`

```bash
curl http://PHONE:8080/v1/face/presets
```

```json
{
  "presets": [{ "id": "cartoon", "name": "Cartoon", "parameters": { … } }],
  "styles": ["none", "comic", "crystallize", "pixellate", "posterize",
             "thermal", "xray", "noir", "bloom"],
  "directions": ["source_into_target", "target_into_source"]
}
```

Built-in presets: `none`, `subtle`, `beauty`, `cartoon`, `alien`, `chipmunk`,
`statue`, `anonymize`, `swirl`.

**Python:** `phone.face_presets()`

### Face parameters

Clamped on decode, exactly like the voice parameters. Every geometry control is
signed and centred on 0, so **0 is always identity**.

| Field | Range | Notes |
|---|---|---|
| `eye_size`, `nose_width`, `mouth_size`, `chin_length`, `face_width`, `swirl` | −1…1 | Landmark-anchored geometry; radii scale with interocular distance |
| `smoothing` | 0…1 | Skin smoothing |
| `warmth`, `brightness`, `saturation` | −1…1 | Colour |
| `style` | name | From `styles`; `null` or `"none"` leaves the image alone. Unknown → `400` |
| `style_amount` | 0…1 | Crossfade between the unstyled and styled result |
| `mask_to_face` | bool | Default `true` — composites everything above through a face-shaped mask, so the background is untouched. This is the difference between a face filter and a whole-image filter |
| `mask_feather` | 0…1 | Mask edge softness |
| `mask_expand` | −0.3…0.6 | Grows/shrinks the mask, as a fraction of interocular distance |

### `POST /v1/face/transform`

Reshapes and restyles every face in the photo. Same three-layer resolution as
the voice transform: `preset`, then `parameters`, then query overrides.

| Query | Notes |
|---|---|
| `preset` | Preset id |
| `eye_size`, `nose_width`, `mouth_size`, `chin_length`, `face_width`, `swirl`, `smoothing`, `warmth`, `style`, `style_amount`, `mask_to_face` | Per-field overrides |
| `format` | `png` (default) or `jpeg` |

```bash
curl 'http://PHONE:8080/v1/face/transform?preset=cartoon' \
     -H 'Content-Type: image/jpeg' -H 'Accept: image/png' \
     --data-binary @portrait.jpg -o cartoon.png
```

```json
{ "image": { "width": 1200, "height": 1600 }, "faces": 1,
  "result": { "content_type": "image/png", "data_base64": "…",
              "width": 1200, "height": 1600 } }
```

**No face is a legitimate outcome, not an error.** The image comes back
untouched with `"faces": 0`, so a client can say "no face found" rather than
surfacing a failure. Resolution survives the round trip — the result *is* the
image, so it is not downscaled.

**Python:** `phone.face_transform("portrait.jpg", preset="cartoon")` → `bytes`

### `POST /v1/face/swap`

Aligns the source face to the target's eye line, intersects the mask with the
destination's face outline, matches mean skin tone, and blends.

| Body field | Type | Notes |
|---|---|---|
| `source_image_base64` | string, **required** | |
| `target_image_base64` | string, **required** | |
| `parameters` | object | See below |

| Parameter | Range | Notes |
|---|---|---|
| `direction` | `source_into_target` (default) · `target_into_source` | Which image donates the face |
| `blend` | 0…1 | Opacity of the swapped face (default 0.9) |
| `feather` | 0…1 | Mask edge softness (default 0.5) |
| `color_match` | 0…1 | Pull toward the destination's skin tone (default 0.8; 0 keeps the original colour) |
| `scale` | 0.8…1.2 | Size nudge on top of the landmark-derived scale |
| `offset_x`, `offset_y` | −0.3…0.3 | Position nudge, in interocular distances |
| `face` | object | Optional face effects applied to the finished composite |

```bash
curl http://PHONE:8080/v1/face/swap -H 'Content-Type: application/json' -d '{
  "source_image_base64": "…", "target_image_base64": "…",
  "parameters": { "direction": "source_into_target", "blend": 0.9 }
}'
```

```json
{ "image": { "width": 1024, "height": 1024 },
  "result": { "content_type": "image/png", "data_base64": "…", … },
  "notes": [
    "Landmark-aligned composite: existing pixels are warped and blended onto the destination face. This is not a generative face swap and synthesizes no new identity.",
    "Best results come from similar head pose, framing and lighting in both photos."
  ] }
```

Both inputs are downscaled to 2048 px on the long edge — two base64 images
share one 50 MB body, and a landmark-aligned composite gains nothing from more
pixels. A photo with no detectable face answers `400` naming which one.

Surface `notes` to the user; they state what the technique is and isn't.

**Python:** `phone.face_swap("me.jpg", "target.jpg")` → `bytes`

---

## Streaming

Four long-lived routes. See [Streaming](../API.md#streaming) for the shared
rules — one slot per modality, `429 busy` when taken, a 30 s idle timeout, and
the `?token=` auth fallback.

### `GET /v1/voice/stream`

WebSocket. Binary frames are raw **16-bit little-endian mono PCM** at the
negotiated rate, in and out — no WAV header per chunk, since the format is
agreed once.

Send this **before the first audio frame**; without it the stream assumes
44100, because a socket handler never sees the HTTP request and so cannot read
a query parameter:

```json
{ "type": "format", "sample_rate": 48000 }
```

Then retune at any time, with no interruption to the audio:

```json
{ "type": "parameters", "parameters": { "pitch_cents": -800, "reverb": 0.35 } }
```

Changing `sample_rate` mid-stream rebuilds the engine, discarding anything
ringing in it. On close, the reverb tail is flushed so the last words don't end
mid-syllable.

```bash
websocat ws://PHONE:8080/v1/voice/stream
```

### `GET /v1/face/stream`

WebSocket. Binary frames are **JPEG**, in and out.

```json
{ "type": "parameters", "parameters": { "eye_size": 0.6, "style": "comic" } }
{ "type": "target", "image_base64": "…" }
{ "type": "swap", "parameters": { "blend": 0.9, "color_match": 0.8 } }
```

`target` sets the swap donor once; every frame after it is composited against
that photo.

Keep exactly one frame outstanding and drop frames the phone doesn't keep up
with — the same rule as [live video](vision.md#live-video) over the one-shot
endpoints.

### `GET /v1/face/broadcast`

The phone's **own** camera, already transformed, as MJPEG
(`multipart/x-mixed-replace; boundary=sidecarmlframe`). No client library
needed:

```html
<img src="http://PHONE:8080/v1/face/broadcast?preset=cartoon">
```

```bash
ffplay http://PHONE:8080/v1/face/broadcast
```

Takes `?preset=` and the same per-field overrides as
[`/v1/face/transform`](#post-v1facetransform).

**Python:** `phone.face_broadcast(preset="cartoon")`

### `GET /v1/voice/broadcast`

The phone's **own** microphone, already transformed, as a streaming WAV. The
header declares its size as unknown, the long-standing convention for streamed
WAV: players start immediately and keep going until the socket closes.

```bash
ffplay 'http://PHONE:8080/v1/voice/broadcast?preset=robot'
```

**Python:** `phone.voice_broadcast(preset="robot")`

Both broadcast routes answer `503 capability_unavailable` when the app isn't
supplying capture — the camera and microphone belong to the app process, not
the server package.
