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

    def scan_document(self, image: str | Path, out: str | Path | None = None) -> dict:
        result = self._post_file("/v1/vision/document", image, "image/jpeg")
        if out and result.get("corrected"):
            Path(out).write_bytes(base64.b64decode(result["corrected"]["data_base64"]))
        return result

    def generate_image(self, prompt: str, n: int = 1, style: str | None = None) -> list[bytes]:
        result = self._post_json(
            "/v1/images/generations", {"prompt": prompt, "n": n, "style": style}
        )
        return [base64.b64decode(item["b64_json"]) for item in result["data"]]

    def image_styles(self) -> list[str]:
        """Image-generation styles available on this device (needs Apple Intelligence)."""
        return self._get("/v1/images/styles")["styles"]

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
