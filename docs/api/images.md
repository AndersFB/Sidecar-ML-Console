# Image generation

Part of the [Sidecar ML HTTP API reference](../API.md).

Text-to-image via Image Playground's programmatic API. Requires an Apple
Intelligence-capable iPhone with Apple Intelligence enabled — otherwise both
endpoints answer `503 capability_unavailable`. Generation also requires the
Sidecar ML app to be in the **foreground** (a background app answers `503`
with that reason).

### `POST /v1/images/generations`

Generates 1–4 images from a prompt. OpenAI images-API response shape.

| Body field | Type | Notes |
|---|---|---|
| `prompt` | string, **required** | Must not be empty |
| `n` | int | Number of images, clamped to 1–4 (default 1) |
| `style` | string | One of [`GET /v1/images/styles`](#get-v1imagesstyles); default = the device's first available style. Unknown style → `400` listing the options |

```bash
curl http://PHONE:8080/v1/images/generations -H 'Content-Type: application/json' -d '{
  "prompt": "a lighthouse at dusk", "style": "illustration"
}'
```

```json
{ "created": 1767225600, "data": [{ "b64_json": "…" }] }
```

Each `b64_json` is a base64 **PNG**. Decode straight to a file:

```bash
curl -s http://PHONE:8080/v1/images/generations -H 'Content-Type: application/json' \
     -d '{"prompt": "a lighthouse at dusk"}' | jq -r '.data[0].b64_json' | base64 -d > out.png
```

Prompt-side rejections are `400`s with a reason (empty prompt, unsupported
prompt language, unsupported input concept). Generation runs one request at a
time; extra requests queue.

**Python:** `phone.generate_image("a lighthouse at dusk", style="illustration")` → `list[bytes]`

### `POST /v1/images/stylize`

Restyles a photo of a person — an illustrated or animated version of them —
with an optional prompt to steer the result. Same response shape as
[`/v1/images/generations`](#post-v1imagesgenerations).

| Body field | Type | Notes |
|---|---|---|
| `image_base64` | string, **required** | The source photo. Downscaled to 2048 px on the long edge before generation |
| `prompt` | string | Optional text concept layered on top of the photo |
| `n` | int | Number of images, clamped to 1–4 (default 1) |
| `style` | string | One of [`GET /v1/images/styles`](#get-v1imagesstyles) |

```bash
curl http://PHONE:8080/v1/images/stylize -H 'Content-Type: application/json' -d '{
  "image_base64": "…", "style": "illustration"
}'
```

```json
{ "created": 1767225600, "data": [{ "b64_json": "…" }] }
```

The source image is passed to Image Playground as a *concept*, so the
photo-specific rejections apply here and only here: a face too small to use,
an unsupported input image, or concepts that require a person in the frame all
come back as `400`s naming the problem.

This is the generative counterpart to
[`POST /v1/face/transform`](effects.md#post-v1facetransform): that endpoint
gives precise control over the real photograph, this one hands the whole image
to a model.

**Python:** `phone.stylize_image("portrait.jpg", style="illustration")` → `list[bytes]`

### `GET /v1/images/styles`

The generation styles available on this device.

```bash
curl http://PHONE:8080/v1/images/styles
```

```json
{ "styles": ["animation", "illustration", "sketch"] }
```

The set is device-dependent — always offer what this endpoint returns rather
than hard-coding it.

**Python:** `phone.image_styles()`
