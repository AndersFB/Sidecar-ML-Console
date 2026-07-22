# Speech

Part of the [Sidecar ML HTTP API reference](../API.md).

Text-to-speech and fully on-device speech-to-text. Audio inputs follow the
shared binary convention (raw body or `{"audio_base64": "…"}`); accepted
containers are WAV, M4A/AAC, MP3, AIFF, CAF and FLAC. Browser-recorded
webm/opus is **not** decodable — record to WAV. Speech requests process one
at a time; extra requests queue.

### `POST /v1/speech/speak`

Synthesizes speech with any installed system voice. The audio never plays on
the phone — it is returned to you as 16-bit PCM WAV.

| Body field | Type | Notes |
|---|---|---|
| `text` | string, **required** | Up to 5000 characters |
| `voice` | string | A voice `identifier` from [`GET /v1/speech/voices`](#get-v1speechvoices), or a BCP-47 language code (best voice for that language). Default: the system `en-US` voice. Unknown values → `400` |
| `rate` | number | Speaking rate 0–1 (clamped), default ≈ 0.5 |
| `pitch` | number | Pitch multiplier 0.5–2 (clamped), default 1 |

```bash
curl http://PHONE:8080/v1/speech/speak -H 'Content-Type: application/json' \
     -H 'Accept: audio/wav' -d '{"text": "Hello from my iPhone"}' -o hello.wav
```

With `Accept: audio/wav` (above) the response is the raw WAV. Otherwise it is
the JSON envelope:

```json
{ "content_type": "audio/wav", "data_base64": "…", "duration_s": 1.62, "sample_rate": 22050 }
```

`sample_rate` depends on the chosen voice (typically 22050 Hz).

**Python:** `phone.speak("Hello from my iPhone", "hello.wav", voice=None)`

### `GET /v1/speech/voices`

All installed voices, sorted by language then name. Includes Personal Voice
when the user has authorized it in the Sidecar ML app.

```bash
curl http://PHONE:8080/v1/speech/voices
```

```json
{
  "voices": [
    {
      "identifier": "com.apple.voice.compact.da-DK.Sara",
      "is_novelty": false,
      "is_personal": false,
      "language": "da-DK",
      "name": "Sara",
      "quality": "default"
    },
    {
      "identifier": "com.apple.voice.enhanced.en-US.Samantha",
      "is_novelty": false,
      "is_personal": false,
      "language": "en-US",
      "name": "Samantha",
      "quality": "enhanced"
    }
  ]
}
```

`quality` is `default`, `enhanced` or `premium` (higher-quality voices are
downloaded by the user in iOS Settings).

**Python:** `phone.voices()`

### `POST /v1/speech/transcribe`

Speech-to-text with timestamped segments, fully on-device (iOS 26
SpeechAnalyzer). Language models are per-locale downloadable assets — see the
errors below.

Input: audio as raw body or JSON `{"audio_base64": "…"}`. Options can be sent
as query parameters or as JSON fields alongside `audio_base64`:

| Option | Default | Notes |
|---|---|---|
| `locale` | `en-US` | BCP-47, case-insensitive, `_` accepted; a bare language matches its first region (`en` → `en-US`). Unsupported → `400` pointing at [`…/locales`](#get-v1speechtranscribelocales) |
| `download` | `false` | If the locale's model is missing, download and install it first (can take minutes — keep the app foregrounded), then transcribe |

```bash
curl 'http://PHONE:8080/v1/speech/transcribe?locale=en-US' \
     -H 'Content-Type: audio/wav' --data-binary @clip.wav
```

```json
{
  "locale": "en-US",
  "segments": [
    { "end_s": 2.41, "start_s": 0.0, "text": "Hello from my iPhone." },
    { "end_s": 4.87, "start_s": 2.74, "text": "This runs fully on-device." }
  ],
  "text": "Hello from my iPhone. This runs fully on-device."
}
```

`locale` echoes the locale actually used (after matching). Segment times are
seconds with two decimals.

Errors:

| Status / `code` | Meaning |
|---|---|
| `400 bad_request` | Unsupported locale, or undecodable audio (see container list above) |
| `503 capability_unavailable` | Model for the locale not installed — retry with `"download": true`, or install it from the app |
| `503 capability_unavailable` | SpeechAnalyzer unsupported on this device |

**Python:** `phone.transcribe("clip.wav", locale="en-US")["text"]`

### `GET /v1/speech/transcribe/locales`

Transcription languages: what the OS supports vs. what is installed on this
phone (sorted BCP-47).

```bash
curl http://PHONE:8080/v1/speech/transcribe/locales
```

```json
{ "installed": ["en-US"], "supported": ["ar-SA", "da-DK", "de-DE", "en-AU", "en-GB", "en-US", "es-ES", "fr-FR", "…"] }
```

**Python:** `phone.transcribe_locales()`
