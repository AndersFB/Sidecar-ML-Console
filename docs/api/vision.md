# Vision

Part of the [Sidecar ML HTTP API reference](../API.md).

All eleven endpoints take **one image** (except `similarity`, which takes two)
using the shared binary-input convention: raw body with
`Content-Type: image/jpeg` (or `image/png`, …), or JSON
`{"image_base64": "…"}`. Accepted formats: PNG, JPEG, HEIC, GIF, TIFF, WebP —
anything else answers `400`.

Geometry is always **pixels with the origin at the image's top-left corner**,
rounded to one decimal. EXIF orientation is applied before analysis, so
coordinates match the image as you see it. Responses echo
`image: {width, height}` for the analyzed image.

`classify`, `feature-print` and `similarity` downscale to a 2048 px long edge
before analysis (they return no coordinates); every endpoint that returns
coordinates analyzes at full resolution. Two vision requests run concurrently;
further requests queue.

### Live video

There is no dedicated streaming endpoint — live clients stream by posting
frames to the one-shot endpoints in a loop. The pattern that works well (and
is what the web console's **Live camera** mode on the Faces and Pose panels
does):

- Capture at ≤720p and encode each frame as JPEG (~0.7 quality). Coordinates
  come back in the pixel space of the frame you sent, ready to draw over the
  preview.
- Keep **exactly one request in flight** and drop frames while waiting. The
  phone runs two vision requests concurrently, shared across all clients — a
  backlog adds latency, never throughput. The loop then self-paces to
  whatever the phone sustains.
- Treat `429 busy` and timeouts as transient: skip the frame, keep going.

Each frame is an ordinary request, so a streaming client shows up
request-by-request in the app's live request log.

### `POST /v1/vision/ocr`

Recognizes printed and handwritten text, with a bounding box and confidence
per line.

| Query | Default | Notes |
|---|---|---|
| `level` | `accurate` | `accurate` or `fast` |
| `languages` | automatic | Comma-separated BCP-47 list, e.g. `en-US,da` |
| `correction` | `true` | Apply language-model correction to the recognized text |

```bash
curl 'http://PHONE:8080/v1/vision/ocr?languages=en-US,da' \
     -H 'Content-Type: image/jpeg' --data-binary @receipt.jpg
```

```json
{
  "image": { "height": 900, "width": 1200 },
  "lines": [
    { "box_px": { "height": 24.0, "width": 321.5, "x": 12.4, "y": 40.1 }, "confidence": 0.98, "text": "SUPERMARKET RECEIPT" },
    { "box_px": { "height": 22.8, "width": 214.0, "x": 12.4, "y": 74.6 }, "confidence": 0.94, "text": "TOTAL 42.00" }
  ],
  "text": "SUPERMARKET RECEIPT\nTOTAL 42.00"
}
```

`text` is every line joined with `\n`, in reading order. No text found →
`"text": ""` and an empty `lines` array.

**Python:** `phone.ocr("receipt.jpg")["text"]`

### `POST /v1/vision/barcodes`

Detects QR codes, EAN, Code 128 and friends — payload plus bounding box per
code.

| Query | Default | Notes |
|---|---|---|
| `symbologies` | all | Comma-separated filter: `qr`, `aztec`, `code128`, `code39`, `code93`, `ean13`, `ean8`, `pdf417`, `datamatrix`, `upce`, `itf14`, `codabar`, `microqr` (unknown names are ignored) |

```bash
curl 'http://PHONE:8080/v1/vision/barcodes?symbologies=qr,ean13' \
     -H 'Content-Type: image/png' --data-binary @code.png
```

```json
{
  "barcodes": [
    { "box_px": { "height": 210.0, "width": 208.5, "x": 495.0, "y": 361.2 }, "payload": "https://example.com/menu", "symbology": "qr" }
  ],
  "image": { "height": 900, "width": 1200 }
}
```

`payload` is omitted when the code's raw bytes have no string representation.
No codes → an empty array (still `200`).

**Python:** `phone.barcodes("code.png")`

### `POST /v1/vision/classify`

Whole-image classification against Apple's built-in ~1000-class taxonomy.

| Query | Default | Notes |
|---|---|---|
| `top_k` | `10` | Maximum labels returned (minimum 1) |
| `min_confidence` | `0.05` | Drop weaker labels |

```bash
curl 'http://PHONE:8080/v1/vision/classify?top_k=5' \
     -H 'Content-Type: image/jpeg' --data-binary @photo.jpg
```

```json
{
  "classifications": [
    { "confidence": 0.83, "label": "espresso" },
    { "confidence": 0.11, "label": "coffee_mug" }
  ],
  "image": { "height": 1536, "width": 2048 }
}
```

Sorted by confidence, descending. Labels are lowercase identifiers from the
built-in taxonomy. `image` reflects the downscaled analysis size (long edge
≤ 2048 px).

**Python:** `phone.classify("photo.jpg", top_k=5)`

### `POST /v1/vision/feature-print`

Image embedding vector for similarity search and clustering. No parameters.

```bash
curl http://PHONE:8080/v1/vision/feature-print \
     -H 'Content-Type: image/jpeg' --data-binary @photo.jpg
```

```json
{ "element_count": 768, "embedding": [0.128, -0.044, 0.371, …] }
```

Compare embeddings with Euclidean distance (that is what
[`/v1/vision/similarity`](#post-v1visionsimilarity) computes). Embeddings are
comparable with each other on the same OS version; a major OS update may
change the model revision.

**Python:** `phone.feature_print("photo.jpg")`

### `POST /v1/vision/similarity`

Distance between two images — lower is more similar. JSON body only:

| Body field | Type | Notes |
|---|---|---|
| `image_a_base64` | string, **required** | First image, base64 |
| `image_b_base64` | string, **required** | Second image, base64 |

```bash
curl http://PHONE:8080/v1/vision/similarity -H 'Content-Type: application/json' -d "{
  \"image_a_base64\": \"$(base64 -i a.jpg)\", \"image_b_base64\": \"$(base64 -i b.jpg)\"
}"
```

```json
{ "distance": 0.61, "similarity_hint": "very similar" }
```

`similarity_hint` maps the distance to a rough judgment:

| `distance` | hint |
|---|---|
| < 0.35 | `near duplicate` |
| < 0.65 | `very similar` |
| < 0.95 | `related` |
| ≥ 0.95 | `different` |

**Python:** `phone.similarity("a.jpg", "b.jpg")`

### `POST /v1/vision/subject-mask`

Background removal — lifts the foreground subject(s) out of any photo.

| Query | Default | Notes |
|---|---|---|
| `mode` | `cutout` | `cutout` = subject with transparent background; `mask` = white-on-black subject mask |
| `crop` | `false` | Cutout only: crop the output to the subject's bounding box |

```bash
curl 'http://PHONE:8080/v1/vision/subject-mask?crop=true' -H 'Content-Type: image/jpeg' \
     -H 'Accept: image/png' --data-binary @photo.jpg -o cutout.png
```

The output is always PNG: raw bytes with `Accept: image/png` (as above), or
the JSON envelope by default:

```json
{ "content_type": "image/png", "data_base64": "…", "height": 640, "width": 480 }
```

All detected foreground instances are lifted together. No subject →
`400 bad_request` ("No foreground subject found in the image.").

**Python:** `phone.remove_background("photo.jpg", "cutout.png")`

### `POST /v1/vision/person-segmentation`

Person mask — a grayscale PNG where white means person.

| Query | Default | Notes |
|---|---|---|
| `quality` | `balanced` | `fast`, `balanced` or `accurate` |

```bash
curl 'http://PHONE:8080/v1/vision/person-segmentation?quality=accurate' \
     -H 'Content-Type: image/jpeg' -H 'Accept: image/png' --data-binary @photo.jpg -o mask.png
```

Same output convention as `subject-mask`: raw PNG with `Accept: image/png`,
JSON envelope (`content_type`, `data_base64`, `width`, `height`) otherwise.

**Python:** `phone.person_segmentation("photo.jpg", "mask.png", quality="accurate")`

### `POST /v1/vision/faces`

Face boxes with head angles and per-region landmark points. No parameters.

```bash
curl http://PHONE:8080/v1/vision/faces -H 'Content-Type: image/jpeg' --data-binary @group.jpg
```

```json
{
  "faces": [
    {
      "box_px": { "height": 261.9, "width": 224.0, "x": 419.4, "y": 219.7 },
      "landmarks": {
        "face_contour": [{ "x": 424.9, "y": 268.3 }, …],
        "left_eye": [{ "x": 471.2, "y": 292.0 }, …],
        "outer_lips": [{ "x": 486.6, "y": 419.8 }, …]
      },
      "pitch_deg": 1.2,
      "roll_deg": 2.1,
      "yaw_deg": -8.0
    }
  ],
  "image": { "height": 900, "width": 1200 }
}
```

- `roll_deg` / `yaw_deg` / `pitch_deg` are head angles in degrees (one
  decimal), omitted when Vision cannot estimate them.
- `landmarks` maps region name → array of `{x, y}` points. Regions (present
  when detected): `face_contour`, `left_eye`, `right_eye`, `left_eyebrow`,
  `right_eyebrow`, `nose`, `nose_crest`, `median_line`, `outer_lips`,
  `inner_lips`, `left_pupil`, `right_pupil`.

**Python:** `phone.faces("group.jpg")`

### `POST /v1/vision/body-pose`

Body skeleton joints for every detected person. No parameters.

```bash
curl http://PHONE:8080/v1/vision/body-pose -H 'Content-Type: image/jpeg' --data-binary @photo.jpg
```

```json
{
  "image": { "height": 1600, "width": 1200 },
  "persons": [
    {
      "joints": {
        "left_shoulder": { "confidence": 0.973, "x": 550.9, "y": 561.2 },
        "neck": { "confidence": 0.951, "x": 604.0, "y": 540.8 },
        "nose": { "confidence": 0.988, "x": 610.2, "y": 468.9 },
        "right_wrist": { "confidence": 0.766, "x": 802.5, "y": 913.3 }
      }
    }
  ]
}
```

Up to 19 joints per person — nose, eyes, ears, neck, shoulders, elbows,
wrists, hips, knees, ankles and the hip-center `root` — named like
`left_wrist` / `right_ankle`. Joints Vision cannot place are omitted;
`confidence` is 0–1 (three decimals).

**Python:** `phone.body_pose("photo.jpg")`

### `POST /v1/vision/hand-pose`

Hand joints with chirality per detected hand.

| Query | Default | Notes |
|---|---|---|
| `max_hands` | `2` | Detection cap (minimum 1) |

```bash
curl http://PHONE:8080/v1/vision/hand-pose -H 'Content-Type: image/jpeg' --data-binary @hand.jpg
```

```json
{
  "hands": [
    {
      "chirality": "right",
      "joints": {
        "index_tip": { "confidence": 0.942, "x": 501.0, "y": 322.6 },
        "thumb_tip": { "confidence": 0.911, "x": 431.3, "y": 369.0 },
        "wrist": { "confidence": 0.987, "x": 388.2, "y": 500.4 }
      }
    }
  ],
  "image": { "height": 800, "width": 1200 }
}
```

Up to 21 joints per hand: `wrist` plus four per finger, e.g. `thumb_cmc`,
`thumb_mp`, `thumb_ip`, `thumb_tip`, `index_mcp`, `index_pip`, `index_dip`,
`index_tip`, and likewise `middle_*`, `ring_*`, `little_*`. `chirality` is
`"left"` or `"right"`, omitted when undetermined.

**Python:** `phone.hand_pose("hand.jpg", max_hands=2)`

### `POST /v1/vision/document`

Finds a document in a photo and returns its corner quad plus a
perspective-corrected scan.

| Query | Default | Notes |
|---|---|---|
| `correct` | `true` | Include the perspective-corrected scan |
| `format` | `png` | Corrected-scan encoding: `png` or `jpeg` (alias `jpg`). JPEG (quality 0.92) is typically 5–10x smaller for photographed documents. Unknown values → `400` |

```bash
curl http://PHONE:8080/v1/vision/document -H 'Content-Type: image/jpeg' --data-binary @paper.jpg
```

```json
{
  "confidence": 0.97,
  "corrected": { "content_type": "image/png", "data_base64": "…", "height": 1918, "width": 1370 },
  "detected": true,
  "image": { "height": 3024, "width": 4032 },
  "quad_px": [
    { "x": 231.5, "y": 118.0 },
    { "x": 3719.4, "y": 402.8 },
    { "x": 3502.2, "y": 2661.7 },
    { "x": 168.0, "y": 2440.9 }
  ]
}
```

`quad_px` lists the detected corners in order: top-left, top-right,
bottom-right, bottom-left. When no document is found the response is
`{ "detected": false, "image": {…} }` — no quad, no scan.

**Raw scan output:** when the `Accept` header names the chosen format's
content type, the corrected scan comes back as raw bytes instead of the JSON
envelope:

```bash
curl 'http://PHONE:8080/v1/vision/document?format=jpeg' -H 'Content-Type: image/jpeg' \
     -H 'Accept: image/jpeg' --data-binary @paper.jpg -o scan.jpg
```

If no document is detected (or `correct=false`), there is no scan and the
response is JSON regardless of `Accept` — raw-mode clients should check the
response `Content-Type`.

**Python:** `phone.scan_document("paper.jpg", out="scan.jpg", format="jpeg")`
