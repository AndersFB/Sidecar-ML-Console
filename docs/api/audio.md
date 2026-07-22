# Audio analysis

Part of the [Sidecar ML HTTP API reference](../API.md).

Sound-event classification and song identification. Audio inputs follow the
shared binary convention (raw body or `{"audio_base64": "…"}`); accepted
containers are WAV, M4A/AAC, MP3, AIFF, CAF and FLAC (browser webm/opus is
not decodable).

### `POST /v1/sound/classify`

Detects ~300 everyday sounds (speech, music, sirens, animals, appliances, …)
over sliding windows of the clip.

| Query | Default | Notes |
|---|---|---|
| `window` | `1.5` | Window length in seconds, clamped to 0.5–15. Windows overlap by 50% |
| `top_k` | `5` | Labels per window and in the summary, clamped to 1–20 |

```bash
curl 'http://PHONE:8080/v1/sound/classify?window=2' \
     -H 'Content-Type: audio/wav' --data-binary @clip.wav
```

```json
{
  "duration_s": 4.0,
  "top": [
    { "confidence": 0.912, "label": "dog_bark" },
    { "confidence": 0.208, "label": "dog" }
  ],
  "windows": [
    {
      "classifications": [
        { "confidence": 0.912, "label": "dog_bark" },
        { "confidence": 0.187, "label": "dog" }
      ],
      "end_s": 2.0,
      "start_s": 0.0
    },
    {
      "classifications": [{ "confidence": 0.208, "label": "dog" }],
      "end_s": 3.0,
      "start_s": 1.0
    }
  ]
}
```

Per window: the top-K labels with confidence > 0.005, sorted descending.
`top` summarizes the clip — each label's best confidence across all windows.
Undecodable audio → `400` with the container list.

**Python:** `phone.classify_sound("clip.wav")["top"]`

### `GET /v1/sound/labels`

Every class label the sound classifier can emit (~300, sorted).

```bash
curl http://PHONE:8080/v1/sound/labels
```

```json
{ "labels": ["accordion", "acoustic_guitar", "air_conditioner", "air_horn", "aircraft", "…"] }
```

**Python:** `phone.sound_labels()`

### `POST /v1/shazam/match`

Identifies a song via the Shazam catalog. The audio fingerprint is computed
on-device from the **first ~15 seconds** of the clip (~10 s is plenty);
catalog matching is the one operation in this API that needs internet.

```bash
curl http://PHONE:8080/v1/shazam/match -H 'Content-Type: audio/wav' --data-binary @clip.wav
```

```json
{
  "matched": true,
  "media": {
    "album": "Random Access Memories",
    "apple_music_url": "https://music.apple.com/…",
    "artist": "Daft Punk",
    "artwork_url": "https://is1-ssl.mzstatic.com/…",
    "offset_s": 42.5,
    "shazam_id": "605236711",
    "title": "Get Lucky"
  }
}
```

`offset_s` is where in the song the clip starts. Any `media` field the
catalog does not know is omitted. No match is a normal response —
`{ "matched": false }` — while network failure answers
`503 capability_unavailable`.

**Python:** `phone.shazam("clip.wav")`
