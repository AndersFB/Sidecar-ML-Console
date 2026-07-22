/**
 * The complete HTTP API of the Sidecar ML iPhone server, as structured data
 * for the in-console API Reference page. Mirrors docs/API.md — when a server
 * endpoint changes, update both. `{{BASE}}` in examples is replaced with the
 * connected phone's address at render time.
 */

export interface EndpointDoc {
  method: 'GET' | 'POST';
  path: string;
  summary: string;
  /** Reachable without a bearer token even when auth is enabled. */
  noAuth?: boolean;
  /** Query parameters or JSON body fields worth calling out. */
  params?: { name: string; note: string }[];
  /** Compact example response (JSON). */
  response?: string;
  curl?: string;
  python?: string;
}

export interface EndpointGroup {
  title: string;
  note?: string;
  endpoints: EndpointDoc[];
}

export const API_REFERENCE: EndpointGroup[] = [
  {
    title: 'Server',
    endpoints: [
      {
        method: 'GET',
        path: '/',
        summary: 'Service info — what a browser or network scanner sees first.',
        noAuth: true,
        response: '{ "app": "Sidecar ML", "version": "1.0", "capabilities": "/v1/capabilities" }',
        curl: 'curl {{BASE}}/',
        python: 'phone.info()',
      },
      {
        method: 'GET',
        path: '/health',
        summary: 'Liveness probe with uptime. Use this to test reachability.',
        noAuth: true,
        response: '{ "status": "ok", "app": "Sidecar ML", "version": "1.0", "uptime_s": 12.5 }',
        curl: 'curl {{BASE}}/health',
        python: 'phone.health()',
      },
      {
        method: 'GET',
        path: '/v1/capabilities',
        summary:
          'Every capability with live availability — unavailable ones include a human-readable reason (e.g. "Needs Apple Intelligence").',
        response:
          '[{ "id": "chat", "name": "Chat (On-Device LLM)", "category": "language",\n   "summary": "…", "requires_network": false, "available": true,\n   "reason": null, "endpoints": ["POST /v1/chat/completions"] }, …]',
        curl: 'curl {{BASE}}/v1/capabilities',
        python: 'phone.capabilities()',
      },
    ],
  },
  {
    title: 'Chat — OpenAI-compatible',
    note: 'Works with any OpenAI SDK: point base_url at {{BASE}}/v1 with any api_key. Requires an Apple Intelligence-capable iPhone.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/models',
        summary: 'OpenAI model list; contains "apple-fm" when Apple Intelligence is available, empty otherwise.',
        response: '{ "object": "list", "data": [{ "id": "apple-fm", "object": "model", "owned_by": "apple" }] }',
        curl: 'curl {{BASE}}/v1/models',
        python: 'phone.models()',
      },
      {
        method: 'POST',
        path: '/v1/chat/completions',
        summary:
          'OpenAI chat-completions shape against the on-device foundation model. Streaming uses SSE with chat.completion.chunk frames and a final data: [DONE]. Usage tokens are estimated.',
        params: [
          { name: 'messages', note: 'system / user / assistant; string or text-parts content' },
          { name: 'temperature', note: 'sampling temperature' },
          { name: 'max_tokens', note: 'also accepts max_completion_tokens' },
          { name: 'stream', note: 'true → Server-Sent Events' },
          {
            name: 'response_format',
            note: '{"type": "json_object"} or {"type": "json_schema", "json_schema": {name, schema}} → guided generation',
          },
          { name: 'model', note: 'accepted and ignored' },
        ],
        response:
          '{ "choices": [{ "message": { "role": "assistant", "content": "…" } }],\n  "usage": { "total_tokens": 42, "estimated": true } }\n// errors: 400 context_length_exceeded (~4k-token window), 400 content_filter, 429 busy',
        curl:
          "curl {{BASE}}/v1/chat/completions -H 'Content-Type: application/json' -d '{\n  \"messages\": [{\"role\": \"user\", \"content\": \"Two-line poem about lighthouses.\"}]\n}'",
        python:
          'phone.chat("Two-line poem about lighthouses.")\n\n# or with the official OpenAI SDK:\nfrom openai import OpenAI\nllm = OpenAI(base_url="{{BASE}}/v1", api_key="unused")\nllm.chat.completions.create(model="apple-fm",\n    messages=[{"role": "user", "content": "Hi!"}])',
      },
    ],
  },
  {
    title: 'Vision',
    note: 'Send the image as a raw body (Content-Type: image/jpeg, image/png, …) or as JSON {"image_base64": "…"}. All coordinates are pixels with the origin at the top-left; EXIF orientation is applied server-side. Responses echo image {width, height}. Binary outputs default to a JSON envelope {content_type, data_base64}; send Accept: image/png for raw bytes.',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/vision/ocr',
        summary: 'Text recognition — full text plus per-line boxes and confidence.',
        params: [
          { name: 'level', note: 'accurate (default) | fast' },
          { name: 'languages', note: 'comma-separated, e.g. en-US,da' },
          { name: 'correction', note: 'true → language correction' },
        ],
        response:
          '{ "text": "…", "lines": [{ "text": "…", "confidence": 0.98,\n  "box_px": { "x": 12, "y": 40, "width": 320, "height": 24 } }],\n  "image": { "width": 1200, "height": 900 } }',
        curl: "curl {{BASE}}/v1/vision/ocr -H 'Content-Type: image/jpeg' --data-binary @receipt.jpg",
        python: 'phone.ocr("receipt.jpg")["text"]',
      },
      {
        method: 'POST',
        path: '/v1/vision/barcodes',
        summary: 'QR / EAN / Code128 / … payloads with bounding boxes.',
        params: [{ name: 'symbologies', note: 'restrict, e.g. qr,ean13' }],
        response: '{ "barcodes": [{ "symbology": "qr", "payload": "https://…", "box_px": { … } }] }',
        curl: "curl {{BASE}}/v1/vision/barcodes -H 'Content-Type: image/png' --data-binary @code.png",
        python: 'phone.barcodes("code.png")',
      },
      {
        method: 'POST',
        path: '/v1/vision/classify',
        summary: 'Whole-image classification against the built-in ~1000-class taxonomy.',
        params: [
          { name: 'top_k', note: 'default 10' },
          { name: 'min_confidence', note: 'default 0.05' },
        ],
        response: '{ "classifications": [{ "label": "espresso", "confidence": 0.83 }, …] }',
        curl: "curl '{{BASE}}/v1/vision/classify?top_k=5' -H 'Content-Type: image/jpeg' --data-binary @photo.jpg",
        python: 'phone.classify("photo.jpg", top_k=5)',
      },
      {
        method: 'POST',
        path: '/v1/vision/feature-print',
        summary: 'Image embedding vector for similarity search / clustering.',
        response: '{ "embedding": [0.12, -0.4, …], "element_count": 768 }',
        curl: "curl {{BASE}}/v1/vision/feature-print -H 'Content-Type: image/jpeg' --data-binary @photo.jpg",
        python: 'phone.feature_print("photo.jpg")',
      },
      {
        method: 'POST',
        path: '/v1/vision/similarity',
        summary: 'Distance between two images (lower = more similar). JSON body only.',
        params: [
          { name: 'image_a_base64', note: 'first image' },
          { name: 'image_b_base64', note: 'second image' },
        ],
        response: '{ "distance": 0.61, "similarity_hint": "similar" }',
        curl:
          'curl {{BASE}}/v1/vision/similarity -H \'Content-Type: application/json\' -d \'{\n  "image_a_base64": "…", "image_b_base64": "…"\n}\'',
        python: 'phone.similarity("a.jpg", "b.jpg")',
      },
      {
        method: 'POST',
        path: '/v1/vision/subject-mask',
        summary: 'Background removal — returns the cutout (or mask) as PNG.',
        params: [
          { name: 'mode', note: 'cutout (default) | mask' },
          { name: 'crop', note: 'true → crop to subject bounds' },
        ],
        response: '{ "content_type": "image/png", "data_base64": "…" }',
        curl:
          "curl {{BASE}}/v1/vision/subject-mask -H 'Content-Type: image/jpeg' -H 'Accept: image/png' \\\n     --data-binary @photo.jpg -o cutout.png",
        python: 'phone.remove_background("photo.jpg", "cutout.png")',
      },
      {
        method: 'POST',
        path: '/v1/vision/person-segmentation',
        summary: 'Person mask as PNG.',
        params: [{ name: 'quality', note: 'fast | balanced (default) | accurate' }],
        response: '{ "content_type": "image/png", "data_base64": "…" }',
        curl:
          "curl '{{BASE}}/v1/vision/person-segmentation?quality=accurate' \\\n     -H 'Content-Type: image/jpeg' -H 'Accept: image/png' --data-binary @photo.jpg -o mask.png",
        python: 'phone.person_segmentation("photo.jpg", "mask.png", quality="accurate")',
      },
      {
        method: 'POST',
        path: '/v1/vision/faces',
        summary: 'Face boxes with roll / yaw / pitch (degrees) and landmark points per region.',
        response:
          '{ "faces": [{ "box_px": { … }, "roll_deg": 2.1, "yaw_deg": -8.0, "pitch_deg": 1.2,\n  "landmarks": { "left_eye": [{ "x": …, "y": … }], … } }] }',
        curl: "curl {{BASE}}/v1/vision/faces -H 'Content-Type: image/jpeg' --data-binary @group.jpg",
        python: 'phone.faces("group.jpg")',
      },
      {
        method: 'POST',
        path: '/v1/vision/body-pose',
        summary: 'Body-pose joints per detected person.',
        response: '{ "persons": [{ "joints": { "left_wrist": { "x": 512, "y": 640, "confidence": 0.9 }, … } }] }',
        curl: "curl {{BASE}}/v1/vision/body-pose -H 'Content-Type: image/jpeg' --data-binary @photo.jpg",
        python: 'phone.body_pose("photo.jpg")',
      },
      {
        method: 'POST',
        path: '/v1/vision/hand-pose',
        summary: 'Hand joints with chirality (left / right) per detected hand.',
        params: [{ name: 'max_hands', note: 'default 2' }],
        response: '{ "hands": [{ "chirality": "right", "joints": { "index_tip": { "x": …, "y": …, "confidence": … }, … } }] }',
        curl: "curl {{BASE}}/v1/vision/hand-pose -H 'Content-Type: image/jpeg' --data-binary @hand.jpg",
        python: 'phone.hand_pose("hand.jpg")',
      },
      {
        method: 'POST',
        path: '/v1/vision/document',
        summary: 'Document detection — quad corners plus a perspective-corrected PNG scan.',
        params: [{ name: 'correct', note: 'true (default) → include corrected scan' }],
        response:
          '{ "detected": true, "confidence": 0.97,\n  "quad_px": [{ "x": …, "y": … }, … 4 corners],\n  "corrected": { "content_type": "image/png", "data_base64": "…" } }',
        curl: "curl {{BASE}}/v1/vision/document -H 'Content-Type: image/jpeg' --data-binary @paper.jpg",
        python: 'phone.scan_document("paper.jpg", out="scan.png")',
      },
    ],
  },
  {
    title: 'Image generation',
    note: 'Image Playground on the phone — requires an Apple Intelligence-capable iPhone (otherwise 503).',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/images/generations',
        summary: 'Generate 1–4 images from a prompt (OpenAI images response shape).',
        params: [
          { name: 'prompt', note: 'required' },
          { name: 'n', note: '1–4, default 1' },
          { name: 'style', note: 'animation | illustration | sketch (see /v1/images/styles)' },
        ],
        response: '{ "created": 1730000000, "data": [{ "b64_json": "…" }] }',
        curl:
          'curl {{BASE}}/v1/images/generations -H \'Content-Type: application/json\' -d \'{\n  "prompt": "a lighthouse at dusk", "style": "illustration"\n}\'',
        python: 'phone.generate_image("a lighthouse at dusk", style="illustration")',
      },
      {
        method: 'GET',
        path: '/v1/images/styles',
        summary: 'Generation styles available on this device.',
        response: '{ "styles": ["animation", "illustration", "sketch"] }',
        curl: 'curl {{BASE}}/v1/images/styles',
        python: 'phone.image_styles()',
      },
    ],
  },
  {
    title: 'Speech',
    note: 'Audio in: raw body (audio/wav, audio/m4a, …) or JSON {"audio_base64": "…"}. Accepted containers: WAV, M4A/AAC, MP3, AIFF, CAF, FLAC. Browser-recorded webm/opus is NOT decodable — record to WAV.',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/speech/speak',
        summary: 'Text-to-speech — returns a WAV envelope.',
        params: [
          { name: 'text', note: 'required' },
          { name: 'voice', note: 'voice identifier (see /v1/speech/voices) or a BCP-47 language code' },
          { name: 'rate', note: '0–1, default ≈0.5' },
          { name: 'pitch', note: '0.5–2, default 1' },
        ],
        response: '{ "content_type": "audio/wav", "data_base64": "…", "duration_s": 1.8, "sample_rate": 22050 }',
        curl:
          'curl {{BASE}}/v1/speech/speak -H \'Content-Type: application/json\' \\\n     -H \'Accept: audio/wav\' -d \'{"text": "Hello from my iPhone"}\' -o hello.wav',
        python: 'phone.speak("Hello from my iPhone", "hello.wav")',
      },
      {
        method: 'GET',
        path: '/v1/speech/voices',
        summary: 'All installed voices, including Personal Voice when authorized in the app.',
        response:
          '{ "voices": [{ "identifier": "com.apple.voice.compact.en-US.Samantha", "name": "Samantha",\n  "language": "en-US", "quality": "compact", "is_personal": false, "is_novelty": false }] }',
        curl: 'curl {{BASE}}/v1/speech/voices',
        python: 'phone.voices()',
      },
      {
        method: 'POST',
        path: '/v1/speech/transcribe',
        summary: 'Fully on-device speech-to-text with timed segments.',
        params: [
          { name: 'locale', note: 'e.g. en-US (query or JSON field)' },
          { name: 'download', note: 'JSON "download": true opts into fetching a missing language model (slow)' },
        ],
        response:
          '{ "text": "…", "locale": "en-US",\n  "segments": [{ "text": "…", "start_s": 0.0, "end_s": 2.4 }] }\n// 503 asset_not_installed → model needs downloading',
        curl:
          "curl '{{BASE}}/v1/speech/transcribe?locale=en-US' -H 'Content-Type: audio/wav' --data-binary @clip.wav",
        python: 'phone.transcribe("clip.wav", locale="en-US")["text"]',
      },
      {
        method: 'GET',
        path: '/v1/speech/transcribe/locales',
        summary: 'Transcription languages — supported by the OS vs installed on this phone.',
        response: '{ "supported": ["en-US", "da-DK", …], "installed": ["en-US"] }',
        curl: 'curl {{BASE}}/v1/speech/transcribe/locales',
        python: 'phone.transcribe_locales()',
      },
    ],
  },
  {
    title: 'Translation',
    note: 'Fully offline. Language pairs must be downloaded on the phone first (Sidecar ML app → Settings → Translation) — otherwise 503 with a hint.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/translation/languages',
        summary: 'Supported languages; add ?source=en&target=de to check one pair.',
        params: [{ name: 'source, target', note: 'optional pair check → pair_status: installed | supported | unsupported' }],
        response: '{ "languages": ["en", "de", …], "pair_status": "installed" }',
        curl: "curl '{{BASE}}/v1/translation/languages?source=en&target=de'",
        python: 'phone.translation_languages(source="en", target="de")',
      },
      {
        method: 'POST',
        path: '/v1/translation/translate',
        summary: 'Translate one text or a batch.',
        params: [
          { name: 'text | texts', note: 'single string or array' },
          { name: 'source', note: 'optional — auto-detected when omitted' },
          { name: 'target', note: 'required' },
        ],
        response: '{ "translations": [{ "text": "Guten Morgen" }] }',
        curl:
          'curl {{BASE}}/v1/translation/translate -H \'Content-Type: application/json\' -d \'{\n  "text": "Good morning", "target": "de"\n}\'',
        python: 'phone.translate("Good morning", target="de")',
      },
    ],
  },
  {
    title: 'Text (NaturalLanguage)',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/nlp/analyze',
        summary: 'Language detection, sentiment, named entities and tokens in one call.',
        params: [
          { name: 'text', note: 'required' },
          { name: 'features', note: 'subset of ["language", "sentiment", "entities", "tokens"]; default all' },
        ],
        response:
          '{ "language": "en", "language_hypotheses": { "en": 0.99 }, "sentiment": 0.6,\n  "entities": [{ "text": "Copenhagen", "type": "place", "start": 10, "end": 20 }],\n  "tokens": [{ "text": "loved", "lemma": "love", "part_of_speech": "Verb" }] }',
        curl:
          'curl {{BASE}}/v1/nlp/analyze -H \'Content-Type: application/json\' -d \'{\n  "text": "I loved Copenhagen last summer."\n}\'',
        python: 'phone.analyze_text("I loved Copenhagen last summer.")',
      },
      {
        method: 'POST',
        path: '/v1/nlp/embed',
        summary: 'Sentence embeddings for semantic search.',
        params: [{ name: 'texts', note: 'array of strings' }],
        response: '{ "embeddings": [[0.01, …]], "dimension": 512, "language": "en" }',
        curl:
          'curl {{BASE}}/v1/nlp/embed -H \'Content-Type: application/json\' -d \'{"texts": ["hello world"]}\'',
        python: 'phone.embed_text("hello world", "hi earth")',
      },
      {
        method: 'POST',
        path: '/v1/nlp/similarity',
        summary: 'Semantic distance between two texts (lower distance = closer).',
        params: [
          { name: 'text_a', note: 'first text' },
          { name: 'text_b', note: 'second text' },
        ],
        response: '{ "distance": 0.42, "cosine": 0.81 }',
        curl:
          'curl {{BASE}}/v1/nlp/similarity -H \'Content-Type: application/json\' -d \'{\n  "text_a": "cat", "text_b": "kitten"\n}\'',
        python: 'phone.text_similarity("cat", "kitten")',
      },
    ],
  },
  {
    title: 'Audio analysis',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/sound/classify',
        summary: 'Sound-event classification over sliding windows (~300 classes).',
        params: [
          { name: 'window', note: 'window length in seconds, default 1.5' },
          { name: 'top_k', note: 'default 5' },
        ],
        response:
          '{ "duration_s": 4.0,\n  "windows": [{ "start_s": 0.0, "end_s": 1.5, "classifications": [{ "label": "dog_bark", "confidence": 0.8 }] }],\n  "top": [{ "label": "dog_bark", "confidence": 0.8 }] }',
        curl: "curl {{BASE}}/v1/sound/classify -H 'Content-Type: audio/wav' --data-binary @clip.wav",
        python: 'phone.classify_sound("clip.wav")["top"]',
      },
      {
        method: 'GET',
        path: '/v1/sound/labels',
        summary: 'All class labels the sound classifier can emit.',
        response: '{ "labels": ["air_conditioner", "air_horn", …] }',
        curl: 'curl {{BASE}}/v1/sound/labels',
        python: 'phone.sound_labels()',
      },
      {
        method: 'POST',
        path: '/v1/shazam/match',
        summary: 'Identify a song via the Shazam catalog — the one endpoint that needs internet. ~10 s of audio is plenty.',
        response:
          '{ "matched": true, "media": { "title": "…", "artist": "…", "album": "…",\n  "apple_music_url": "…", "artwork_url": "…", "offset_s": 32.1 } }',
        curl: "curl {{BASE}}/v1/shazam/match -H 'Content-Type: audio/wav' --data-binary @clip.wav",
        python: 'phone.shazam("clip.wav")',
      },
    ],
  },
];

/** Flat list of "METHOD /path" for completeness checks (tests). */
export const ALL_DOCUMENTED_ROUTES = API_REFERENCE.flatMap((group) =>
  group.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`),
);
