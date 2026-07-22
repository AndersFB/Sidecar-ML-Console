# Text (NaturalLanguage)

Part of the [Sidecar ML HTTP API reference](../API.md).

Language detection, sentiment, named entities, tokenization and sentence
embeddings via Apple's NaturalLanguage framework. All three endpoints take
JSON bodies and are always available.

### `POST /v1/nlp/analyze`

One call for language, sentiment, entities and tokens — pick the features you
need.

| Body field | Type | Notes |
|---|---|---|
| `text` | string, **required** | Must not be empty |
| `features` | array | Subset of `["language", "sentiment", "entities", "tokens"]`; default all. Only requested features appear in the response |

```bash
curl http://PHONE:8080/v1/nlp/analyze -H 'Content-Type: application/json' -d '{
  "text": "I loved Copenhagen last summer."
}'
```

```json
{
  "entities": [
    { "end": 18, "start": 8, "text": "Copenhagen", "type": "place" }
  ],
  "language": "en",
  "language_hypotheses": [
    { "confidence": 0.996, "language": "en" },
    { "confidence": 0.002, "language": "da" }
  ],
  "sentiment": 0.6,
  "tokens": [
    { "lemma": "i", "pos": "Pronoun", "text": "I" },
    { "lemma": "love", "pos": "Verb", "text": "loved" },
    { "lemma": "copenhagen", "pos": "Noun", "text": "Copenhagen" }
  ]
}
```

- `language` is the dominant language (BCP-47 language code), omitted when
  undetectable; `language_hypotheses` lists up to 3 candidates with
  confidence, sorted descending.
- `sentiment` scores the first paragraph from −1 (negative) to 1 (positive);
  omitted when no score is available.
- `entities` finds people, places and organizations (`type`: `person`,
  `place`, `organization`) with **character offsets** into `text`
  (`start` inclusive, `end` exclusive).
- `tokens` lists words with `lemma` (dictionary form) and `pos` (Apple
  lexical classes like `Noun`, `Verb`, `Adjective`, `Pronoun`); either is
  omitted when unknown. How rich these are depends on the device's installed
  language assets.

**Python:** `phone.analyze_text("I loved Copenhagen last summer.")`

### `POST /v1/nlp/embed`

Sentence embeddings for semantic search.

| Body field | Type | Notes |
|---|---|---|
| `text` | string | One text — or use `texts` |
| `texts` | array of strings | Batch |

```bash
curl http://PHONE:8080/v1/nlp/embed -H 'Content-Type: application/json' \
     -d '{"texts": ["hello world", "hi earth"]}'
```

```json
{ "dimension": 512, "embeddings": [[0.012, -0.104, …], [0.018, -0.096, …]], "language": "en" }
```

One language model serves the whole request: the language is auto-detected
from all texts joined (falling back to English), so batch texts of the same
language. Embeddings from the same model/language are mutually comparable.

Errors: `501 not_implemented` when the device has no sentence-embedding model
for the detected language; `400` when a text cannot be embedded.

**Python:** `phone.embed_text("hello world", "hi earth")`

### `POST /v1/nlp/similarity`

Semantic distance between two texts, computed on their sentence embeddings.

| Body field | Type | Notes |
|---|---|---|
| `text_a` | string, **required** | First text |
| `text_b` | string, **required** | Second text |

```bash
curl http://PHONE:8080/v1/nlp/similarity -H 'Content-Type: application/json' -d '{
  "text_a": "cat", "text_b": "kitten"
}'
```

```json
{ "cosine": 0.81, "distance": 0.42 }
```

`distance` is Euclidean (lower = closer); `cosine` is cosine similarity
(higher = closer, omitted for zero-magnitude vectors). Both rounded to three
decimals.

**Python:** `phone.text_similarity("cat", "kitten")`
