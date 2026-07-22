"""A FastAPI mirror of the complete Sidecar ML API — your iPhone behind FastAPI.

Every phone endpoint is re-exposed under the same path with typed request
bodies and file uploads, so http://127.0.0.1:8000/docs gives you an
interactive Swagger UI for the whole phone API. Binary results (speech,
masks) are returned as real image/audio responses instead of base64
envelopes, and chat streaming is passed through as Server-Sent Events.

Run:
    SIDECAR_URL=http://<phone-ip>:8080 uvicorn fastapi_proxy:app --reload

Then:
    open http://127.0.0.1:8000/docs
    curl -F "file=@receipt.jpg" http://127.0.0.1:8000/v1/vision/ocr
    curl -X POST http://127.0.0.1:8000/v1/chat/completions \
         -H 'Content-Type: application/json' \
         -d '{"messages": [{"role": "user", "content": "What is OCR?"}]}'

Set SIDECAR_TOKEN as well if auth is enabled in the app.
"""

from __future__ import annotations

import base64
import os
from contextlib import asynccontextmanager
from typing import Any, Literal

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from loguru import logger
from pydantic import BaseModel
from starlette.background import BackgroundTask

SIDECAR_URL = os.environ.get("SIDECAR_URL", "http://127.0.0.1:8080")
SIDECAR_TOKEN = os.environ.get("SIDECAR_TOKEN")

phone: httpx.AsyncClient = None  # type: ignore[assignment] — created in lifespan


@asynccontextmanager
async def lifespan(_: FastAPI):
    global phone
    headers = {"Authorization": f"Bearer {SIDECAR_TOKEN}"} if SIDECAR_TOKEN else {}
    phone = httpx.AsyncClient(base_url=SIDECAR_URL, headers=headers, timeout=120)
    logger.info(f"proxying every endpoint to {SIDECAR_URL} — Swagger UI at /docs")
    yield
    await phone.aclose()


app = FastAPI(
    title="Sidecar ML proxy",
    description="The full on-device ML API of a Sidecar ML iPhone, mirrored "
    "through FastAPI. Try any endpoint right here in the Swagger UI.",
    lifespan=lifespan,
)


# ------------------------------------------------------------------ helpers


def _params(**kwargs: Any) -> dict:
    """Query params with unset options dropped."""
    return {key: value for key, value in kwargs.items() if value is not None}


def _fail(response: httpx.Response) -> None:
    try:
        detail = response.json()["error"]["message"]
    except Exception:  # noqa: BLE001 — non-JSON error body
        detail = response.text
    logger.warning(f"phone answered {response.status_code} for {response.request.url.path}: {detail}")
    raise HTTPException(status_code=response.status_code, detail=detail)


async def _get(path: str, params: dict | None = None) -> Any:
    response = await phone.get(path, params=params or {})
    if response.is_error:
        _fail(response)
    return response.json()


async def _post_json(path: str, body: Any, params: dict | None = None) -> Any:
    response = await phone.post(path, json=body, params=params or {})
    if response.is_error:
        _fail(response)
    return response.json()


async def _post_upload(path: str, file: UploadFile, params: dict | None = None) -> Any:
    """Forward an uploaded file as the raw request body (the phone takes no multipart)."""
    payload = await file.read()
    response = await phone.post(
        path,
        content=payload,
        params=params or {},
        headers={"Content-Type": file.content_type or "application/octet-stream"},
    )
    if response.is_error:
        _fail(response)
    return response.json()


def _raw(envelope: dict) -> Response:
    """Decode the phone's {content_type, data_base64} envelope to real bytes."""
    return Response(
        content=base64.b64decode(envelope["data_base64"]),
        media_type=envelope["content_type"],
    )


async def _file_b64(file: UploadFile) -> str:
    return base64.b64encode(await file.read()).decode()


# ------------------------------------------------------------- body models


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: Any  # string or OpenAI text-parts


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    temperature: float | None = None
    max_tokens: int | None = None
    stream: bool = False
    response_format: dict | None = None
    model: str | None = None  # accepted and ignored by the phone


class ImageGenRequest(BaseModel):
    prompt: str
    n: int = 1
    style: str | None = None  # animation | illustration | sketch


class SpeakRequest(BaseModel):
    text: str
    voice: str | None = None  # identifier or BCP-47 language code
    rate: float | None = None  # 0–1
    pitch: float | None = None  # 0.5–2


class TranslateRequest(BaseModel):
    text: str | None = None
    texts: list[str] | None = None
    source: str | None = None
    target: str


class NlpAnalyzeRequest(BaseModel):
    text: str
    features: list[str] | None = None  # language | sentiment | entities | tokens


class NlpEmbedRequest(BaseModel):
    texts: list[str]


class NlpSimilarityRequest(BaseModel):
    text_a: str
    text_b: str


# ------------------------------------------------------------------ server


@app.get("/", tags=["Server"])
async def service_info() -> Any:
    """The phone's service-info document."""
    return await _get("/")


@app.get("/health", tags=["Server"])
async def health() -> Any:
    """Liveness of the phone server (with uptime)."""
    return await _get("/health")


@app.get("/v1/capabilities", tags=["Server"])
async def capabilities() -> Any:
    """Every capability with live availability and reasons."""
    return await _get("/v1/capabilities")


@app.get("/phone", tags=["Server"])
async def phone_overview() -> Any:
    """Compact health + capability overview (proxy convenience, not a phone route)."""
    health_body = await _get("/health")
    caps = await _get("/v1/capabilities")
    return {
        "health": health_body,
        "capabilities": [{"id": c["id"], "available": c["available"]} for c in caps],
    }


# -------------------------------------------------------------------- chat


@app.get("/v1/models", tags=["Chat"])
async def models() -> Any:
    """OpenAI model list; contains apple-fm when Apple Intelligence is available."""
    return await _get("/v1/models")


@app.post("/v1/chat/completions", tags=["Chat"])
async def chat_completions(body: ChatRequest) -> Any:
    """OpenAI-compatible chat; set `stream: true` for Server-Sent Events."""
    payload = body.model_dump(exclude_none=True)
    if body.stream:
        request = phone.build_request("POST", "/v1/chat/completions", json=payload)
        upstream = await phone.send(request, stream=True)
        if upstream.is_error:
            await upstream.aread()
            _fail(upstream)
        return StreamingResponse(
            upstream.aiter_raw(),
            media_type="text/event-stream",
            background=BackgroundTask(upstream.aclose),
        )
    return await _post_json("/v1/chat/completions", payload)


# ------------------------------------------------------------------ vision


@app.post("/v1/vision/ocr", tags=["Vision"])
async def vision_ocr(
    file: UploadFile = File(...),
    level: Literal["accurate", "fast"] | None = None,
    languages: str | None = None,
    correction: bool | None = None,
) -> Any:
    """Text + per-line boxes and confidence."""
    return await _post_upload(
        "/v1/vision/ocr", file, _params(level=level, languages=languages, correction=correction)
    )


@app.post("/v1/vision/barcodes", tags=["Vision"])
async def vision_barcodes(
    file: UploadFile = File(...), symbologies: str | None = None
) -> Any:
    """QR/EAN/Code128/… payloads + boxes."""
    return await _post_upload("/v1/vision/barcodes", file, _params(symbologies=symbologies))


@app.post("/v1/vision/classify", tags=["Vision"])
async def vision_classify(
    file: UploadFile = File(...),
    top_k: int | None = None,
    min_confidence: float | None = None,
) -> Any:
    """~1000-class image labels."""
    return await _post_upload(
        "/v1/vision/classify", file, _params(top_k=top_k, min_confidence=min_confidence)
    )


@app.post("/v1/vision/feature-print", tags=["Vision"])
async def vision_feature_print(file: UploadFile = File(...)) -> Any:
    """Image embedding vector."""
    return await _post_upload("/v1/vision/feature-print", file)


@app.post("/v1/vision/similarity", tags=["Vision"])
async def vision_similarity(
    file_a: UploadFile = File(...), file_b: UploadFile = File(...)
) -> Any:
    """Distance between two images (lower = more similar)."""
    return await _post_json(
        "/v1/vision/similarity",
        {"image_a_base64": await _file_b64(file_a), "image_b_base64": await _file_b64(file_b)},
    )


@app.post(
    "/v1/vision/subject-mask",
    tags=["Vision"],
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
async def vision_subject_mask(
    file: UploadFile = File(...),
    mode: Literal["cutout", "mask"] | None = None,
    crop: bool | None = None,
) -> Response:
    """Background removal — returns the PNG directly (the phone returns a JSON envelope)."""
    return _raw(await _post_upload("/v1/vision/subject-mask", file, _params(mode=mode, crop=crop)))


@app.post(
    "/v1/vision/person-segmentation",
    tags=["Vision"],
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
async def vision_person_segmentation(
    file: UploadFile = File(...),
    quality: Literal["fast", "balanced", "accurate"] | None = None,
) -> Response:
    """Person mask — returns the PNG directly."""
    return _raw(
        await _post_upload("/v1/vision/person-segmentation", file, _params(quality=quality))
    )


@app.post("/v1/vision/faces", tags=["Vision"])
async def vision_faces(file: UploadFile = File(...)) -> Any:
    """Face boxes, roll/yaw/pitch, landmarks."""
    return await _post_upload("/v1/vision/faces", file)


@app.post("/v1/vision/body-pose", tags=["Vision"])
async def vision_body_pose(file: UploadFile = File(...)) -> Any:
    """Body-pose joints per person."""
    return await _post_upload("/v1/vision/body-pose", file)


@app.post("/v1/vision/hand-pose", tags=["Vision"])
async def vision_hand_pose(
    file: UploadFile = File(...), max_hands: int | None = None
) -> Any:
    """Hand joints with chirality."""
    return await _post_upload("/v1/vision/hand-pose", file, _params(max_hands=max_hands))


@app.post("/v1/vision/document", tags=["Vision"])
async def vision_document(
    file: UploadFile = File(...), correct: bool | None = None
) -> Any:
    """Document quad + perspective-corrected scan (JSON envelope, as the phone sends it)."""
    return await _post_upload("/v1/vision/document", file, _params(correct=correct))


# ------------------------------------------------------------ image gen


@app.post("/v1/images/generations", tags=["Image generation"])
async def images_generations(body: ImageGenRequest) -> Any:
    """Generate 1–4 images (needs Apple Intelligence)."""
    return await _post_json("/v1/images/generations", body.model_dump(exclude_none=True))


@app.get("/v1/images/styles", tags=["Image generation"])
async def images_styles() -> Any:
    """Generation styles available on the device."""
    return await _get("/v1/images/styles")


# ------------------------------------------------------------------ speech


@app.post(
    "/v1/speech/speak",
    tags=["Speech"],
    response_class=Response,
    responses={200: {"content": {"audio/wav": {}}}},
)
async def speech_speak(body: SpeakRequest) -> Response:
    """Text-to-speech — returns the WAV directly (the phone returns a JSON envelope)."""
    return _raw(await _post_json("/v1/speech/speak", body.model_dump(exclude_none=True)))


@app.get("/v1/speech/voices", tags=["Speech"])
async def speech_voices() -> Any:
    """All installed voices."""
    return await _get("/v1/speech/voices")


@app.post("/v1/speech/transcribe", tags=["Speech"])
async def speech_transcribe(
    file: UploadFile = File(...),
    locale: str | None = None,
    download: bool | None = None,
) -> Any:
    """On-device speech-to-text; `download=true` opts into fetching a missing model."""
    return await _post_upload(
        "/v1/speech/transcribe", file, _params(locale=locale, download=download)
    )


@app.get("/v1/speech/transcribe/locales", tags=["Speech"])
async def speech_transcribe_locales() -> Any:
    """Transcription languages: supported vs installed."""
    return await _get("/v1/speech/transcribe/locales")


# ------------------------------------------------------------- translation


@app.get("/v1/translation/languages", tags=["Translation"])
async def translation_languages(
    source: str | None = None, target: str | None = None
) -> Any:
    """Supported languages; pass source+target for pair_status."""
    return await _get("/v1/translation/languages", _params(source=source, target=target))


@app.post("/v1/translation/translate", tags=["Translation"])
async def translation_translate(body: TranslateRequest) -> Any:
    """Offline translation (pairs must be downloaded on the phone)."""
    return await _post_json("/v1/translation/translate", body.model_dump(exclude_none=True))


# --------------------------------------------------------------------- nlp


@app.post("/v1/nlp/analyze", tags=["NLP"])
async def nlp_analyze(body: NlpAnalyzeRequest) -> Any:
    """Language, sentiment, entities, tokens."""
    return await _post_json("/v1/nlp/analyze", body.model_dump(exclude_none=True))


@app.post("/v1/nlp/embed", tags=["NLP"])
async def nlp_embed(body: NlpEmbedRequest) -> Any:
    """Sentence embeddings."""
    return await _post_json("/v1/nlp/embed", body.model_dump(exclude_none=True))


@app.post("/v1/nlp/similarity", tags=["NLP"])
async def nlp_similarity(body: NlpSimilarityRequest) -> Any:
    """Semantic distance between two texts."""
    return await _post_json("/v1/nlp/similarity", body.model_dump(exclude_none=True))


# ------------------------------------------------------------------- audio


@app.post("/v1/sound/classify", tags=["Audio"])
async def sound_classify(
    file: UploadFile = File(...),
    window: float | None = None,
    top_k: int | None = None,
) -> Any:
    """Sound-event classification over sliding windows."""
    return await _post_upload("/v1/sound/classify", file, _params(window=window, top_k=top_k))


@app.get("/v1/sound/labels", tags=["Audio"])
async def sound_labels() -> Any:
    """All sound-classifier labels."""
    return await _get("/v1/sound/labels")


@app.post("/v1/shazam/match", tags=["Audio"])
async def shazam_match(file: UploadFile = File(...)) -> Any:
    """Identify a song via the Shazam catalog (needs internet)."""
    return await _post_upload("/v1/shazam/match", file)
