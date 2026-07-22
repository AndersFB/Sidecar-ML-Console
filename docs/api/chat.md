# Chat — OpenAI-compatible

Part of the [Sidecar ML HTTP API reference](../API.md).

Apple Intelligence's on-device foundation model (~3B parameters) behind the
OpenAI chat-completions surface, so any OpenAI SDK works as-is:

```python
from openai import OpenAI

llm = OpenAI(base_url="http://PHONE:8080/v1", api_key="unused")
reply = llm.chat.completions.create(
    model="apple-fm",
    messages=[{"role": "user", "content": "Two-line poem about lighthouses."}],
)
```

Requires an iPhone with Apple Intelligence enabled. Otherwise
`POST /v1/chat/completions` answers `503 capability_unavailable` and
`GET /v1/models` returns an empty list — the `reason` in
[`GET /v1/capabilities`](server.md#get-v1capabilities) says which of the two
it is (unsupported device vs. feature turned off vs. model still downloading).

### `GET /v1/models`

OpenAI-style model list. Contains exactly one model, `apple-fm`, when the LLM
is available; an empty `data` array otherwise (the endpoint itself always
answers `200`).

```bash
curl http://PHONE:8080/v1/models
```

```json
{ "data": [{ "created": 1767225600, "id": "apple-fm", "object": "model", "owned_by": "apple" }], "object": "list" }
```

**Python:** `phone.models()`

### `POST /v1/chat/completions`

One request shape covers plain completion, SSE streaming, and guided JSON
output.

| Body field | Type | Notes |
|---|---|---|
| `messages` | array, **required** | `{role, content}` items; roles `system` / `user` / `assistant`; `content` is a string or OpenAI text-parts (`[{"type": "text", "text": "…"}]` — text parts only) |
| `temperature` | number | Sampling temperature |
| `max_tokens` | int | Response token cap (`max_completion_tokens` is also accepted and wins) |
| `stream` | bool | `true` → Server-Sent Events (below) |
| `response_format` | object | `{"type": "json_object"}` or `{"type": "json_schema", …}` (below) |
| `model` | string | Accepted and ignored — there is only one model |

```bash
curl http://PHONE:8080/v1/chat/completions -H 'Content-Type: application/json' -d '{
  "messages": [{"role": "user", "content": "Two-line poem about lighthouses."}]
}'
```

```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "Steadfast on the rock, it burns through fog and foam,\nA patient star that walks the sailors home.",
        "role": "assistant"
      }
    }
  ],
  "created": 1767225600,
  "id": "chatcmpl-4f0e2b6a9c8d4e21a7b3f9d0",
  "model": "apple-fm",
  "object": "chat.completion",
  "usage": { "completion_tokens": 24, "estimated": true, "prompt_tokens": 11, "total_tokens": 35 }
}
```

Foundation Models exposes no token counts, so `usage` is estimated
(characters ÷ 4) and flagged `"estimated": true`.

#### Streaming (SSE)

`"stream": true` switches the response to `text/event-stream` (chunked
transfer). Each frame is a `data: <json>` line carrying an OpenAI
`chat.completion.chunk`; the stream ends with `data: [DONE]`.

```bash
curl -N http://PHONE:8080/v1/chat/completions -H 'Content-Type: application/json' -d '{
  "messages": [{"role": "user", "content": "Count to three."}], "stream": true
}'
```

```
data: {"choices":[{"delta":{"content":"","role":"assistant"},"index":0}],"created":1767225600,"id":"chatcmpl-4f0e2b6a9c8d4e21a7b3f9d0","model":"apple-fm","object":"chat.completion.chunk"}

data: {"choices":[{"delta":{"content":"One, "},"index":0}], "…": "…"}

data: {"choices":[{"delta":{"content":"two, three."},"index":0}], "…": "…"}

data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}], "…": "…"}

data: [DONE]
```

The first frame carries `role`, the middle frames carry `content` deltas, the
last frame carries `finish_reason: "stop"`. If generation fails mid-stream,
the next frame is the standard error envelope (`data: {"error": {…}}`)
followed by `data: [DONE]` — watch for it before assuming success.

#### Guided JSON output

- `{"type": "json_object"}` — asks the model for a single JSON object. Not
  schema-enforced (emulated with a prompt instruction).
- `{"type": "json_schema", "json_schema": {"name": "…", "schema": {…}}}` —
  **enforced** guided generation. Supported JSON-Schema subset: `object`
  (with `properties` / `required`), `string`, `number`, `integer`,
  `boolean`, string `enum`s, and `array`. `description`s are passed to the
  model. Unsupported constructs answer `400`.

```bash
curl http://PHONE:8080/v1/chat/completions -H 'Content-Type: application/json' -d '{
  "messages": [{"role": "user", "content": "Name one lighthouse and its country."}],
  "response_format": {"type": "json_schema", "json_schema": {"name": "lighthouse", "schema": {
    "type": "object",
    "properties": {"name": {"type": "string"}, "country": {"type": "string"}},
    "required": ["name", "country"]
  }}}
}'
```

The assistant message `content` is then a JSON string conforming to the
schema, e.g. `"{\"country\": \"France\", \"name\": \"Phare de Cordouan\"}"`.
Streaming works with schemas too — deltas are pieces of the JSON string.

#### Errors

| Status / `code` | Meaning |
|---|---|
| `400 context_length_exceeded` | Conversation exceeds the on-device model's ~4k-token window |
| `400 content_filter` | The model's safety guardrails declined the request |
| `400 unsupported_language` | The model does not support the prompt's language |
| `400 bad_request` | Malformed messages, or unsupported `json_schema` constructs |
| `429 busy` | The on-device model is rate-limiting — retry shortly |
| `503 capability_unavailable` | No usable Apple Intelligence on this device (`message` says why) |

**Python:** `phone.chat("Prompt", system=None, max_tokens=None)` ·
`for delta in phone.chat_stream("Prompt"): print(delta, end="")`
