"""A fake Sidecar ML phone, faithful to the documented wire conventions.

Enough of the real API to exercise the MCP server offline: raw-body binary in,
base64 envelopes out, the `{"error": {...}}` shape, and a capability list whose
availability the tests can flip.
"""

from __future__ import annotations

import base64

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

# A 1x1 transparent PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
# A minimal 44-byte WAV header with no samples.
WAV = b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00" + b"\x00" * 24

CAPABILITIES = [
    {"id": "chat", "name": "Chat", "category": "language", "available": True,
     "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/chat/completions", "GET /v1/models"]},
    {"id": "vision-ocr", "name": "Text Recognition (OCR)", "category": "vision",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/vision/ocr"]},
    {"id": "vision-analysis", "name": "Image Analysis", "category": "vision",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/vision/barcodes", "POST /v1/vision/classify",
                   "POST /v1/vision/feature-print", "POST /v1/vision/similarity"]},
    {"id": "vision-detectors", "name": "Detectors", "category": "vision",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/vision/faces", "POST /v1/vision/body-pose",
                   "POST /v1/vision/hand-pose", "POST /v1/vision/document"]},
    {"id": "vision-subjects", "name": "Subjects", "category": "vision",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/vision/subject-mask",
                   "POST /v1/vision/person-segmentation"]},
    {"id": "nlp", "name": "NLP", "category": "text", "available": True,
     "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/nlp/analyze", "POST /v1/nlp/embed",
                   "POST /v1/nlp/similarity"]},
    {"id": "speech-speak", "name": "Speech Synthesis", "category": "speech",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/speech/speak", "GET /v1/speech/voices"]},
    {"id": "speech-transcribe", "name": "Transcription", "category": "speech",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/speech/transcribe",
                   "GET /v1/speech/transcribe/locales"]},
    {"id": "sound", "name": "Sound", "category": "audio", "available": True,
     "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/sound/classify", "GET /v1/sound/labels"]},
    {"id": "shazam", "name": "Song ID", "category": "audio", "available": True,
     "requires_network": True, "summary": "",
     "endpoints": ["POST /v1/shazam/match"]},
    {"id": "translation", "name": "Translation", "category": "language",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["POST /v1/translation/translate",
                   "GET /v1/translation/languages"]},
    {"id": "voice-fx", "name": "Voice Changer", "category": "speech",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["GET /v1/voice/presets", "POST /v1/voice/transform",
                   "POST /v1/voice/analyze",
                   "POST /v1/voice/respeak", "GET /v1/voice/stream",
                   "GET /v1/voice/broadcast"]},
    {"id": "face-fx", "name": "Face Changer", "category": "vision",
     "available": True, "requires_network": False, "summary": "",
     "endpoints": ["GET /v1/face/presets", "POST /v1/face/transform",
                   "GET /v1/face/stream", "GET /v1/face/broadcast"]},
    # Deliberately unavailable — the device-varies case the server must handle.
    {"id": "image-gen", "name": "Image Generation", "category": "vision",
     "available": False, "requires_network": False, "summary": "",
     "reason": "This device does not support Apple Intelligence.",
     "endpoints": ["POST /v1/images/generations", "POST /v1/images/stylize",
                   "GET /v1/images/styles"]},
]


class State:
    """Mutable knobs so a test can change what the phone reports."""

    def __init__(self) -> None:
        self.capabilities = [dict(c) for c in CAPABILITIES]
        self.received: list[dict] = []
        self.capability_calls = 0

    def reset(self) -> None:
        self.capabilities = [dict(c) for c in CAPABILITIES]
        self.received.clear()
        self.capability_calls = 0

    def set_available(self, capability_id: str, available: bool, reason: str = "off") -> None:
        for capability in self.capabilities:
            if capability["id"] == capability_id:
                capability["available"] = available
                if available:
                    capability.pop("reason", None)
                else:
                    capability["reason"] = reason


state = State()


def _error(status: int, code: str, message: str, type_: str = "invalid_request_error"):
    return JSONResponse(
        {"error": {"code": code, "message": message, "type": type_}}, status_code=status
    )


async def _record(request: Request) -> bytes:
    body = await request.body()
    state.received.append(
        {
            "path": request.url.path,
            "content_type": request.headers.get("content-type"),
            "query": dict(request.query_params),
            "bytes": len(body),
            "authorization": request.headers.get("authorization"),
        }
    )
    return body


def _guard(route: str):
    """Mimic 503 capability_unavailable for a capability the phone has switched off."""
    for capability in state.capabilities:
        if route in capability["endpoints"] and not capability["available"]:
            return _error(
                503,
                "capability_unavailable",
                capability.get("reason", "unavailable"),
                "service_unavailable_error",
            )
    return None


def _envelope(data: bytes, content_type: str, **extra) -> dict:
    return {
        "content_type": content_type,
        "data_base64": base64.b64encode(data).decode(),
        **extra,
    }


# --------------------------------------------------------------------- routes

async def root(request: Request):
    return JSONResponse({"app": "Sidecar ML", "capabilities": "/v1/capabilities", "version": "1.0"})


async def health(request: Request):
    return JSONResponse({"app": "Sidecar ML", "status": "ok", "uptime_s": 12.5, "version": "1.0"})


async def capabilities(request: Request):
    state.capability_calls += 1
    return JSONResponse(state.capabilities)


async def ocr(request: Request):
    if (blocked := _guard("POST /v1/vision/ocr")) is not None:
        return blocked
    await _record(request)
    return JSONResponse({
        "image": {"width": 100, "height": 50},
        "text": "HELLO WORLD",
        "lines": [{"text": "HELLO WORLD", "confidence": 0.98,
                   "box_px": {"x": 1.0, "y": 2.0, "width": 90.0, "height": 20.0}}],
    })


async def barcodes(request: Request):
    await _record(request)
    return JSONResponse({"image": {"width": 100, "height": 50},
                         "barcodes": [{"symbology": "qr", "payload": "https://example.com",
                                       "box_px": {"x": 0, "y": 0, "width": 10, "height": 10}}]})


async def classify(request: Request):
    await _record(request)
    return JSONResponse({"image": {"width": 100, "height": 50},
                         "classifications": [{"label": "cat", "confidence": 0.91},
                                             {"label": "mammal", "confidence": 0.72}]})


async def feature_print(request: Request):
    await _record(request)
    return JSONResponse({"element_count": 768, "embedding": [0.0123456] * 768})


async def similarity(request: Request):
    body = await request.json()
    if "image_a_base64" not in body or "image_b_base64" not in body:
        return _error(400, "bad_request", "Invalid JSON body: missing key 'image_a_base64'")
    state.received.append({"path": request.url.path, "content_type": request.headers.get("content-type")})
    return JSONResponse({"distance": 0.21, "similarity_hint": "near duplicate"})


async def subject_mask(request: Request):
    await _record(request)
    return JSONResponse(_envelope(PNG, "image/png", width=1, height=1))


async def person_segmentation(request: Request):
    await _record(request)
    return JSONResponse(_envelope(PNG, "image/png", width=1, height=1))


async def faces(request: Request):
    await _record(request)
    return JSONResponse({
        "image": {"width": 100, "height": 50},
        "faces": [{"box_px": {"x": 1, "y": 2, "width": 30, "height": 30},
                   "yaw_deg": 1.5, "pitch_deg": -2.0, "roll_deg": 0.5,
                   "landmarks": {"left_pupil": [[1.0, 2.0]], "face_contour": [[0, 0]] * 40}}],
    })


async def body_pose(request: Request):
    await _record(request)
    return JSONResponse({"image": {"width": 100, "height": 50}, "persons": [
        {"joints": {"nose": {"x": 1, "y": 2, "confidence": 0.9},
                    "left_ear": {"x": 3, "y": 4, "confidence": 0.02}}}]})


async def hand_pose(request: Request):
    await _record(request)
    return JSONResponse({"image": {"width": 100, "height": 50}, "hands": [
        {"chirality": "right", "joints": {"wrist": {"x": 1, "y": 2, "confidence": 0.95},
                                          "thumb_tip": {"x": 5, "y": 6, "confidence": 0.01}}}]})


async def document(request: Request):
    await _record(request)
    return JSONResponse({
        "detected": True, "confidence": 0.88,
        "image": {"width": 100, "height": 50},
        "quad_px": [[0, 0], [10, 0], [10, 10], [0, 10]],
        "corrected": _envelope(PNG, "image/png", width=1, height=1),
    })


async def images_generations(request: Request):
    if (blocked := _guard("POST /v1/images/generations")) is not None:
        return blocked
    body = await request.json()
    n = int(body.get("n", 1))
    return JSONResponse({"created": 0, "data": [
        {"b64_json": base64.b64encode(PNG).decode()} for _ in range(n)]})


async def images_stylize(request: Request):
    if (blocked := _guard("POST /v1/images/stylize")) is not None:
        return blocked
    body = await request.json()
    if not body.get("image_base64"):
        return _error(400, "bad_request", "'image_base64' is not valid base64.")
    state.received.append({"path": request.url.path, "body": body})
    n = int(body.get("n", 1))
    return JSONResponse({"created": 0, "data": [
        {"b64_json": base64.b64encode(PNG).decode()} for _ in range(n)]})


async def images_styles(request: Request):
    if (blocked := _guard("GET /v1/images/styles")) is not None:
        return blocked
    return JSONResponse({"styles": ["animation", "illustration", "sketch"]})


# ------------------------------------------------------------- voice effects

VOICE_PRESETS = {
    "presets": [
        {"id": "none", "name": "None", "parameters": {}},
        {"id": "giant", "name": "Giant",
         "parameters": {"pitch_cents": -800, "rate": 0.9, "reverb_preset": "largeRoom"}},
    ],
    "distortion_presets": ["multiDecimated1", "speechRadioTower"],
    "reverb_presets": ["smallRoom", "largeRoom", "cathedral"],
}


async def voice_presets(request: Request):
    return JSONResponse(VOICE_PRESETS)


async def voice_transform(request: Request):
    await _record(request)
    return JSONResponse(_envelope(WAV, "audio/wav", duration_s=1.5, sample_rate=44100))


async def voice_analyze(request: Request):
    await _record(request)
    return JSONResponse({
        "median_f0_hz": 118.4, "f0_low_hz": 96.2, "f0_high_hz": 151.0,
        "spectral_centroid_hz": 1840.5, "voiced_ratio": 0.62,
        "duration_s": 4.1, "sample_rate": 44100,
    })


async def voice_respeak(request: Request):
    body = await request.json()
    if not body.get("audio_base64"):
        return _error(400, "bad_request", "JSON body must contain valid 'audio_base64'.")
    state.received.append({"path": request.url.path, "body": body})
    return JSONResponse(_envelope(
        WAV, "audio/wav", duration_s=2.9, sample_rate=22050, text="hello from the phone"
    ))


# -------------------------------------------------------------- face effects

FACE_PRESETS = {
    "presets": [
        {"id": "none", "name": "None", "parameters": {}},
        {"id": "cartoon", "name": "Cartoon",
         "parameters": {"eye_size": 0.75, "style": "comic", "style_amount": 0.85}},
    ],
    "styles": ["none", "comic", "crystallize", "pixellate", "noir"],
}


async def face_presets(request: Request):
    if (blocked := _guard("GET /v1/face/presets")) is not None:
        return blocked
    return JSONResponse(FACE_PRESETS)


async def face_transform(request: Request):
    if (blocked := _guard("POST /v1/face/transform")) is not None:
        return blocked
    await _record(request)
    # `faces: 0` is the no-face-found case, which callers must not treat as an
    # error; the query flag lets a test drive it.
    faces = 0 if request.query_params.get("preset") == "noface" else 1
    return JSONResponse({
        "image": {"width": 1, "height": 1},
        "faces": faces,
        "result": _envelope(PNG, "image/png", width=1, height=1),
    })


async def speak(request: Request):
    body = await request.json()
    if not body.get("text"):
        return _error(400, "bad_request", "Invalid JSON body: missing key 'text'")
    state.received.append({"path": request.url.path, "body": body})
    return JSONResponse(_envelope(WAV, "audio/wav", duration_s=0.0, sample_rate=44100))


async def voices(request: Request):
    return JSONResponse({"voices": [{"identifier": "com.apple.voice.compact.en-US.Samantha",
                                     "language": "en-US", "name": "Samantha",
                                     "quality": "default", "is_novelty": False,
                                     "is_personal": False}]})


async def transcribe(request: Request):
    await _record(request)
    return JSONResponse({"locale": "en-US", "text": "hello there",
                         "segments": [{"start_s": 0.0, "end_s": 1.0, "text": "hello there"}]})


async def transcribe_locales(request: Request):
    return JSONResponse({"installed": ["en-US"], "supported": ["en-US", "de-DE"]})


async def translation_languages(request: Request):
    payload: dict = {"languages": ["en", "de", "fr"]}
    if request.query_params.get("target"):
        payload["pair_status"] = "installed"
    return JSONResponse(payload)


async def translate(request: Request):
    body = await request.json()
    if not body.get("target"):
        return _error(400, "bad_request", "Invalid JSON body: missing key 'target'")
    items = body.get("texts") or [body.get("text", "")]
    state.received.append({"path": request.url.path, "body": body})
    return JSONResponse({"translations": [{"text": f"[{body['target']}] {t}"} for t in items]})


async def nlp_analyze(request: Request):
    body = await request.json()
    state.received.append({"path": request.url.path, "body": body})
    return JSONResponse({"language": "en", "sentiment": 0.6,
                         "language_hypotheses": [{"language": "en", "confidence": 0.99}],
                         "entities": [{"text": "Anders", "type": "person", "start": 0, "end": 6}],
                         "tokens": [{"text": "Anders", "lemma": "anders", "pos": "noun"}]})


async def nlp_embed(request: Request):
    body = await request.json()
    texts = body.get("texts") or [body.get("text", "")]
    return JSONResponse({"dimension": 512, "language": "en",
                         "embeddings": [[0.01] * 512 for _ in texts]})


async def nlp_similarity(request: Request):
    return JSONResponse({"cosine": 0.87, "distance": 0.13})


async def sound_classify(request: Request):
    if (blocked := _guard("POST /v1/sound/classify")) is not None:
        return blocked
    await _record(request)
    return JSONResponse({"duration_s": 3.0,
                         "top": [{"label": "dog", "confidence": 0.7}],
                         "windows": [{"start_s": 0.0, "end_s": 1.5,
                                      "classifications": [{"label": "dog", "confidence": 0.7}]}]})


async def sound_labels(request: Request):
    return JSONResponse({"labels": ["dog", "siren", "speech"]})


async def shazam(request: Request):
    await _record(request)
    return JSONResponse({"matched": True, "media": {"title": "Test Song", "artist": "Tester",
                                                    "album": "Fixtures", "offset_s": 1.0,
                                                    "shazam_id": "1"}})


async def models(request: Request):
    return JSONResponse({"object": "list", "data": [
        {"id": "apple-fm", "object": "model", "created": 0, "owned_by": "apple"}]})


async def chat_completions(request: Request):
    body = await request.json()
    if not body.get("messages"):
        return _error(400, "bad_request", "Invalid JSON body: missing key 'messages'")
    state.received.append({"path": request.url.path, "body": body})
    return JSONResponse({
        "id": "chatcmpl-1", "object": "chat.completion", "created": 0, "model": "apple-fm",
        "choices": [{"index": 0, "finish_reason": "stop",
                     "message": {"role": "assistant", "content": "Hi from the phone."}}],
        "usage": {"prompt_tokens": 4, "completion_tokens": 5, "total_tokens": 9,
                  "estimated": True},
    })


app = Starlette(routes=[
    Route("/", root),
    Route("/health", health),
    Route("/v1/capabilities", capabilities),
    Route("/v1/models", models),
    Route("/v1/chat/completions", chat_completions, methods=["POST"]),
    Route("/v1/vision/ocr", ocr, methods=["POST"]),
    Route("/v1/vision/barcodes", barcodes, methods=["POST"]),
    Route("/v1/vision/classify", classify, methods=["POST"]),
    Route("/v1/vision/feature-print", feature_print, methods=["POST"]),
    Route("/v1/vision/similarity", similarity, methods=["POST"]),
    Route("/v1/vision/subject-mask", subject_mask, methods=["POST"]),
    Route("/v1/vision/person-segmentation", person_segmentation, methods=["POST"]),
    Route("/v1/vision/faces", faces, methods=["POST"]),
    Route("/v1/vision/body-pose", body_pose, methods=["POST"]),
    Route("/v1/vision/hand-pose", hand_pose, methods=["POST"]),
    Route("/v1/vision/document", document, methods=["POST"]),
    Route("/v1/images/generations", images_generations, methods=["POST"]),
    Route("/v1/images/stylize", images_stylize, methods=["POST"]),
    Route("/v1/images/styles", images_styles),
    Route("/v1/voice/presets", voice_presets),
    Route("/v1/voice/transform", voice_transform, methods=["POST"]),
    Route("/v1/voice/analyze", voice_analyze, methods=["POST"]),
    Route("/v1/voice/respeak", voice_respeak, methods=["POST"]),
    Route("/v1/face/presets", face_presets),
    Route("/v1/face/transform", face_transform, methods=["POST"]),
    Route("/v1/speech/speak", speak, methods=["POST"]),
    Route("/v1/speech/voices", voices),
    Route("/v1/speech/transcribe", transcribe, methods=["POST"]),
    Route("/v1/speech/transcribe/locales", transcribe_locales),
    Route("/v1/translation/languages", translation_languages),
    Route("/v1/translation/translate", translate, methods=["POST"]),
    Route("/v1/nlp/analyze", nlp_analyze, methods=["POST"]),
    Route("/v1/nlp/embed", nlp_embed, methods=["POST"]),
    Route("/v1/nlp/similarity", nlp_similarity, methods=["POST"]),
    Route("/v1/sound/classify", sound_classify, methods=["POST"]),
    Route("/v1/sound/labels", sound_labels),
    Route("/v1/shazam/match", shazam, methods=["POST"]),
])
