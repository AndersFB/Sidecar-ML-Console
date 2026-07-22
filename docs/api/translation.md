# Translation

Part of the [Sidecar ML HTTP API reference](../API.md).

Fully offline translation via Apple's Translation framework. Language pairs
are downloaded **on the phone** (Sidecar ML app → Settings → Translation);
a pair that is supported but not downloaded answers `503` with that hint.

### `GET /v1/translation/languages`

All supported languages; optionally check one pair's install state.

| Query | Default | Notes |
|---|---|---|
| `target` | — | With `target` set, the response adds `pair_status` |
| `source` | auto | Only meaningful together with `target` |

```bash
curl 'http://PHONE:8080/v1/translation/languages?source=en&target=de'
```

```json
{ "languages": ["ar", "de", "en", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt", "ru", "th", "tr", "uk", "vi", "zh"], "pair_status": "installed" }
```

`pair_status` is `installed` (ready), `supported` (needs download on the
phone) or `unsupported`. Without `target` the field is omitted.

**Python:** `phone.translation_languages(source="en", target="de")`

### `POST /v1/translation/translate`

Translates one text or a batch in a single request.

| Body field | Type | Notes |
|---|---|---|
| `text` | string | One text — or use `texts` |
| `texts` | array of strings | Batch of up to 100 |
| `source` | string | Source language. Omit to auto-detect per text |
| `target` | string, **required** | Target language |

```bash
curl http://PHONE:8080/v1/translation/translate -H 'Content-Type: application/json' -d '{
  "texts": ["Good morning", "See you tonight"], "target": "de"
}'
```

```json
{
  "translations": [
    { "text": "Guten Morgen" },
    { "text": "Bis heute Abend" }
  ]
}
```

`translations` preserves input order. Each item carries the translated
`text`. (A `detected_source` field is defined in the schema for reporting
auto-detected source languages, but current builds do not populate it.)

Errors:

| Status / `code` | Meaning |
|---|---|
| `400 bad_request` | Neither `text` nor `texts`, more than 100 texts, or an unsupported `source`→`target` pair |
| `503 capability_unavailable` | Pair supported but not downloaded — download it in the app (Settings → Translation) |
| `503 capability_unavailable` | Translation not supported on this device |

**Python:** `phone.translate("Good morning", target="de")` → `"Guten Morgen"`
