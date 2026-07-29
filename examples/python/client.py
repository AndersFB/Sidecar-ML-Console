"""Python client for the Sidecar ML iPhone server.

Plain HTTP + JSON — usable from any script, notebook or FastAPI app:

    from client import SidecarClient

    phone = SidecarClient("http://192.168.1.20:8080")
    print(phone.health())
    print(phone.ocr("receipt.jpg")["text"])

Every request is logged through loguru; silence it with
`from loguru import logger; logger.disable("client")`.
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any, Iterator

import httpx
from loguru import logger


class SidecarError(RuntimeError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"[{status} {code}] {message}")
        self.status = status
        self.code = code


def _elapsed(response: httpx.Response) -> str:
    try:
        return f" in {response.elapsed.total_seconds() * 1000:.0f}ms"
    except RuntimeError:  # streaming response not fully read yet
        return ""


class SidecarClient:
    def __init__(self, base_url: str, token: str | None = None, timeout: float = 120.0):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"), headers=headers, timeout=timeout
        )

    # ------------------------------------------------------------------ core

    def _check(self, response: httpx.Response) -> Any:
        label = f"{response.request.method} {response.request.url.path}"
        if response.is_error:
            try:
                error = response.json()["error"]
                code, message = error["code"], error["message"]
            except (KeyError, ValueError):
                logger.warning(f"{label} → HTTP {response.status_code}{_elapsed(response)}")
                response.raise_for_status()
                raise  # unreachable: raise_for_status always raises here
            logger.warning(
                f"{label} → {response.status_code} [{code}]{_elapsed(response)}: {message}"
            )
            raise SidecarError(response.status_code, code, message)
        logger.info(f"{label} → {response.status_code}{_elapsed(response)}")
        return response.json()

    def _post_file(self, path: str, file: str | Path, content_type: str, params: dict | None = None) -> Any:
        data = Path(file).read_bytes()
        response = self._client.post(
            path, content=data, params=params or {}, headers={"Content-Type": content_type}
        )
        return self._check(response)

    def _post_json(self, path: str, body: dict) -> Any:
        return self._check(self._client.post(path, json=body))

    def _get(self, path: str, params: dict | None = None) -> Any:
        return self._check(self._client.get(path, params=params or {}))

    # ---------------------------------------------------------------- server

    def info(self) -> dict:
        """`GET /` — app name, version and where to find the capability list."""
        return self._get("/")

    def health(self) -> dict:
        return self._get("/health")

    def capabilities(self) -> list[dict]:
        return self._get("/v1/capabilities")

    # ---------------------------------------------------------------- vision

    def ocr(self, image: str | Path, languages: str | None = None) -> dict:
        params = {"languages": languages} if languages else {}
        return self._post_file("/v1/vision/ocr", image, "image/jpeg", params)

    def barcodes(self, image: str | Path) -> dict:
        return self._post_file("/v1/vision/barcodes", image, "image/jpeg")

    def classify(self, image: str | Path, top_k: int = 10) -> dict:
        return self._post_file("/v1/vision/classify", image, "image/jpeg", {"top_k": top_k})

    def feature_print(self, image: str | Path) -> dict:
        return self._post_file("/v1/vision/feature-print", image, "image/jpeg")

    def similarity(self, image_a: str | Path, image_b: str | Path) -> dict:
        return self._post_json(
            "/v1/vision/similarity",
            {
                "image_a_base64": base64.b64encode(Path(image_a).read_bytes()).decode(),
                "image_b_base64": base64.b64encode(Path(image_b).read_bytes()).decode(),
            },
        )

    def remove_background(self, image: str | Path, out: str | Path) -> Path:
        """Saves a transparent-background PNG cutout and returns its path."""
        result = self._post_file("/v1/vision/subject-mask", image, "image/jpeg")
        out_path = Path(out)
        out_path.write_bytes(base64.b64decode(result["data_base64"]))
        return out_path

    def person_segmentation(
        self, image: str | Path, out: str | Path, quality: str = "balanced"
    ) -> Path:
        """Saves the person-mask PNG (quality: fast | balanced | accurate)."""
        result = self._post_file(
            "/v1/vision/person-segmentation", image, "image/jpeg", {"quality": quality}
        )
        out_path = Path(out)
        out_path.write_bytes(base64.b64decode(result["data_base64"]))
        return out_path

    def faces(self, image: str | Path) -> dict:
        return self._post_file("/v1/vision/faces", image, "image/jpeg")

    def body_pose(self, image: str | Path) -> dict:
        return self._post_file("/v1/vision/body-pose", image, "image/jpeg")

    def hand_pose(self, image: str | Path, max_hands: int = 2) -> dict:
        return self._post_file(
            "/v1/vision/hand-pose", image, "image/jpeg", {"max_hands": max_hands}
        )

    def scan_document(
        self, image: str | Path, out: str | Path | None = None, format: str = "png"
    ) -> dict:
        """Detect a document; `format` (png | jpeg) sets the corrected-scan
        encoding — JPEG is typically 5-10x smaller for photographed documents."""
        result = self._post_file(
            "/v1/vision/document", image, "image/jpeg", {"format": format}
        )
        if out and result.get("corrected"):
            Path(out).write_bytes(base64.b64decode(result["corrected"]["data_base64"]))
        return result

    def generate_image(self, prompt: str, n: int = 1, style: str | None = None) -> list[bytes]:
        result = self._post_json(
            "/v1/images/generations", {"prompt": prompt, "n": n, "style": style}
        )
        return [base64.b64decode(item["b64_json"]) for item in result["data"]]

    def stylize_image(
        self,
        image: str | Path,
        prompt: str | None = None,
        n: int = 1,
        style: str | None = None,
    ) -> list[bytes]:
        """Restyle a photo of a person. The generative counterpart to
        `face_transform`, which instead edits the real photograph."""
        result = self._post_json(
            "/v1/images/stylize",
            {
                "image_base64": base64.b64encode(Path(image).read_bytes()).decode(),
                "prompt": prompt,
                "n": n,
                "style": style,
            },
        )
        return [base64.b64decode(item["b64_json"]) for item in result["data"]]

    def image_styles(self) -> list[str]:
        """Image-generation styles available on this device (needs Apple Intelligence)."""
        return self._get("/v1/images/styles")["styles"]

    # ------------------------------------------------------------- face effects

    def face_presets(self) -> dict:
        """`{"presets", "styles"}` — what the face changer accepts."""
        return self._get("/v1/face/presets")

    def face_transform(
        self,
        image: str | Path,
        out: str | Path | None = None,
        preset: str | None = None,
        parameters: dict | None = None,
        format: str = "png",
    ) -> dict:
        """Reshape/restyle the faces in a photo.

        A photo with no face is a normal outcome, not an error — the result
        comes back untouched with `faces: 0`.
        """
        body: dict[str, Any] = {
            "image_base64": base64.b64encode(Path(image).read_bytes()).decode()
        }
        if preset:
            body["preset"] = preset
        if parameters:
            body["parameters"] = parameters
        result = self._check(
            self._client.post("/v1/face/transform", json=body, params={"format": format})
        )
        if out:
            Path(out).write_bytes(base64.b64decode(result["result"]["data_base64"]))
        return result

    # ------------------------------------------------------------ voice effects

    def voice_presets(self) -> dict:
        """`{"presets", "distortion_presets", "reverb_presets"}`."""
        return self._get("/v1/voice/presets")

    def voice_transform(
        self,
        audio: str | Path,
        out: str | Path | None = None,
        preset: str | None = None,
        parameters: dict | None = None,
    ) -> bytes:
        """Apply the voice changer to a clip; returns the WAV bytes."""
        body: dict[str, Any] = {
            "audio_base64": base64.b64encode(Path(audio).read_bytes()).decode()
        }
        if preset:
            body["preset"] = preset
        if parameters:
            body["parameters"] = parameters
        result = self._post_json("/v1/voice/transform", body)
        wav = base64.b64decode(result["data_base64"])
        if out:
            Path(out).write_bytes(wav)
        return wav

    def voice_analyze(self, audio: str | Path) -> dict:
        """Acoustic profile of a clip. `voiced_ratio` below 0.1 means the F0
        estimate is not trustworthy."""
        return self._post_file("/v1/voice/analyze", audio, "audio/wav")

    def voice_respeak(
        self,
        audio: str | Path,
        out: str | Path | None = None,
        voice: str | None = None,
        locale: str | None = None,
        parameters: dict | None = None,
    ) -> dict:
        """Transcribe the clip and speak it back through a system voice.

        Returns the envelope including `text`; the raw `Accept: audio/wav` path
        would give bytes only, so the transcript is JSON-path-only.
        """
        result = self._post_json(
            "/v1/voice/respeak",
            {
                "audio_base64": base64.b64encode(Path(audio).read_bytes()).decode(),
                "voice": voice,
                "locale": locale,
                "parameters": parameters,
            },
        )
        if out:
            Path(out).write_bytes(base64.b64decode(result["data_base64"]))
        return result

    # ---------------------------------------------------------------- streaming

    def stream_url(self, path: str, **params: Any) -> str:
        """Absolute URL for a streaming route, carrying the token as `?token=`.

        The four streaming routes accept the token as a query parameter because
        a browser can set an `Authorization` header on neither a WebSocket
        handshake nor an `<img src>`. Use this to hand a URL to ffplay, VLC or
        a `websockets` client.
        """
        request = self._client.build_request("GET", path, params=params or None)
        url = request.url
        auth = self._client.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            url = url.copy_add_param("token", auth[7:])
        return str(url)

    def face_broadcast(self, out: str | Path | None = None, **params: Any) -> Iterator[bytes]:
        """MJPEG of the phone's own transformed camera.

        Yields raw `multipart/x-mixed-replace` bytes (boundary
        `sidecarmlframe`). Answers 503 when the app isn't supplying capture.
        """
        return self._broadcast("/v1/face/broadcast", out, params)

    def voice_broadcast(self, out: str | Path | None = None, **params: Any) -> Iterator[bytes]:
        """Streaming WAV of the phone's own transformed microphone."""
        return self._broadcast("/v1/voice/broadcast", out, params)

    def _broadcast(
        self, path: str, out: str | Path | None, params: dict
    ) -> Iterator[bytes]:
        logger.info(f"GET {path} (stream)")
        handle = Path(out).open("wb") if out else None
        try:
            with self._client.stream("GET", path, params=params, timeout=None) as response:
                if response.is_error:
                    response.read()
                    self._check(response)
                for chunk in response.iter_bytes():
                    if handle:
                        handle.write(chunk)
                    yield chunk
        finally:
            if handle:
                handle.close()

    def voice_stream(self) -> Any:
        """Open `GET /v1/voice/stream` — send PCM16 LE mono chunks, get them back.

        Needs the optional `websockets` package (`pip install websockets`).
        Returns the connection context manager; the caller drives the protocol,
        starting with the format frame — without it the phone assumes 44100:

            import json
            async with phone.voice_stream() as ws:
                await ws.send(json.dumps({"type": "format", "sample_rate": 48000}))
                await ws.send(pcm16_chunk)          # binary frame
                out = await ws.recv()
        """
        return self._websocket("/v1/voice/stream")

    def face_stream(self) -> Any:
        """Open `GET /v1/face/stream` — send JPEG frames, get transformed ones back.

        Needs the optional `websockets` package (`pip install websockets`).
        """
        return self._websocket("/v1/face/stream")

    def _websocket(self, path: str) -> Any:
        try:
            from websockets.asyncio.client import connect
        except ImportError as error:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "The live streaming routes need the optional 'websockets' package: "
                "pip install websockets"
            ) from error
        url = self.stream_url(path).replace("http://", "ws://", 1).replace(
            "https://", "wss://", 1
        )
        logger.info(f"WS {path}")
        return connect(url)

    # ------------------------------------------------------------------ text

    def analyze_text(self, text: str, features: list[str] | None = None) -> dict:
        return self._post_json("/v1/nlp/analyze", {"text": text, "features": features})

    def embed_text(self, *texts: str) -> dict:
        return self._post_json("/v1/nlp/embed", {"texts": list(texts)})

    def text_similarity(self, text_a: str, text_b: str) -> dict:
        """`{"distance", "cosine"}` between two texts (lower distance = closer)."""
        return self._post_json("/v1/nlp/similarity", {"text_a": text_a, "text_b": text_b})

    def translate(self, text: str, target: str, source: str | None = None) -> str:
        result = self._post_json(
            "/v1/translation/translate", {"text": text, "source": source, "target": target}
        )
        return result["translations"][0]["text"]

    def translation_languages(
        self, source: str | None = None, target: str | None = None
    ) -> dict:
        """All supported languages; pass source+target to get `pair_status`."""
        params = {}
        if source:
            params["source"] = source
        if target:
            params["target"] = target
        return self._get("/v1/translation/languages", params)

    # ------------------------------------------------------------------ chat

    def models(self) -> list[dict]:
        """OpenAI-style model list; contains `apple-fm` when the LLM is available."""
        return self._get("/v1/models")["data"]

    def chat(self, prompt: str, system: str | None = None, max_tokens: int | None = None) -> str:
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ]
        result = self._post_json(
            "/v1/chat/completions", {"messages": messages, "max_tokens": max_tokens}
        )
        return result["choices"][0]["message"]["content"]

    def chat_stream(self, prompt: str, system: str | None = None) -> Iterator[str]:
        """Yields text deltas. Also works with the official OpenAI SDK:
        OpenAI(base_url=f"{base}/v1", api_key="unused")."""
        import json

        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ]
        logger.info("POST /v1/chat/completions (stream)")
        with self._client.stream(
            "POST", "/v1/chat/completions", json={"messages": messages, "stream": True}
        ) as response:
            if response.is_error:
                response.read()
                self._check(response)
            for line in response.iter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload == "[DONE]":
                    return
                chunk = json.loads(payload)
                if "error" in chunk:
                    raise SidecarError(500, chunk["error"]["code"], chunk["error"]["message"])
                delta = chunk["choices"][0]["delta"].get("content")
                if delta:
                    yield delta

    # ----------------------------------------------------------------- audio

    def speak(self, text: str, out: str | Path, voice: str | None = None) -> Path:
        result = self._post_json("/v1/speech/speak", {"text": text, "voice": voice})
        out_path = Path(out)
        out_path.write_bytes(base64.b64decode(result["data_base64"]))
        return out_path

    def voices(self) -> list[dict]:
        return self._get("/v1/speech/voices")["voices"]

    def transcribe(self, audio: str | Path, locale: str = "en-US") -> dict:
        return self._post_file(
            "/v1/speech/transcribe", audio, "audio/wav", {"locale": locale}
        )

    def transcribe_locales(self) -> dict:
        """`{"supported": [...], "installed": [...]}` transcription language models."""
        return self._get("/v1/speech/transcribe/locales")

    def classify_sound(self, audio: str | Path) -> dict:
        return self._post_file("/v1/sound/classify", audio, "audio/wav")

    def sound_labels(self) -> list[str]:
        """All ~300 class labels the sound classifier can emit."""
        return self._get("/v1/sound/labels")["labels"]

    def shazam(self, audio: str | Path) -> dict:
        return self._post_file("/v1/shazam/match", audio, "audio/wav")

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "SidecarClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
