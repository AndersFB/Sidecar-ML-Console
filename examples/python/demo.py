#!/usr/bin/env python3
"""Typer CLI against a Sidecar ML iPhone — every endpoint has a command.

    python demo.py --help
    python demo.py health
    python demo.py --base-url http://192.168.1.20:8080 ocr receipt.jpg
    python demo.py chat "Summarize why on-device ML is useful."
    python demo.py chat-stream "Write a haiku about telephones."
    python demo.py speak "Hello from Python" --out hello.wav
    python demo.py transcribe hello.wav
    python demo.py remove-bg photo.jpg --out cutout.png
    python demo.py person-seg photo.jpg --quality accurate
    python demo.py translate "Good morning" --target de
    python demo.py similar-text "cat" "kitten"

The address can also come from the environment: SIDECAR_URL / SIDECAR_TOKEN.
Data goes to stdout; loguru status lines go to stderr (pipe-friendly).
"""

from __future__ import annotations

import json
import sys
from enum import Enum
from pathlib import Path
from typing import Any

import typer
from loguru import logger

from client import SidecarClient, SidecarError

app = typer.Typer(
    help="Talk to a Sidecar ML iPhone from the command line.",
    add_completion=False,
    no_args_is_help=True,
)
state = {"base_url": "http://127.0.0.1:8080", "token": None}

logger.remove()
logger.add(
    sys.stderr,
    format="<level>{level: <7}</level> <dim>{time:HH:mm:ss}</dim> {message}",
    level="INFO",
)

IMAGE = typer.Argument(..., exists=True, dir_okay=False, help="Image file (JPEG/PNG/…)")
AUDIO = typer.Argument(..., exists=True, dir_okay=False, help="Audio file (WAV/M4A/MP3/…)")


class SegQuality(str, Enum):
    fast = "fast"
    balanced = "balanced"
    accurate = "accurate"


@app.callback()
def main(
    base_url: str = typer.Option(
        "http://127.0.0.1:8080",
        envvar="SIDECAR_URL",
        help="Phone address, e.g. http://192.168.1.20:8080",
    ),
    token: str | None = typer.Option(
        None, envvar="SIDECAR_TOKEN", help="Bearer token if auth is enabled in the app"
    ),
    quiet: bool = typer.Option(False, "--quiet", "-q", help="Hide per-request logging"),
) -> None:
    if quiet:
        logger.disable("client")
    state.update(base_url=base_url, token=token)


def phone() -> SidecarClient:
    return SidecarClient(state["base_url"], token=state["token"])


def dump(value: Any) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------- server


@app.command()
def info() -> None:
    """GET / — app name and version."""
    with phone() as p:
        dump(p.info())


@app.command()
def health() -> None:
    """GET /health — liveness probe."""
    with phone() as p:
        dump(p.health())


@app.command()
def capabilities() -> None:
    """List every capability with live availability."""
    with phone() as p:
        for capability in p.capabilities():
            marker = "✓" if capability["available"] else "✗"
            print(f"{marker} {capability['id']:20s} {capability['name']}")
            if not capability["available"]:
                print(f"    ↳ {capability.get('reason', '')}")


# ------------------------------------------------------------------ chat


@app.command()
def models() -> None:
    """OpenAI-style model list (contains apple-fm when available)."""
    with phone() as p:
        dump(p.models())


@app.command()
def chat(
    prompt: str,
    system: str | None = typer.Option(None, help="System prompt"),
    max_tokens: int | None = typer.Option(None),
) -> None:
    """One-shot chat with the on-device LLM."""
    with phone() as p:
        print(p.chat(prompt, system=system, max_tokens=max_tokens))


@app.command(name="chat-stream")
def chat_stream(prompt: str, system: str | None = typer.Option(None)) -> None:
    """Streaming chat — tokens print as they arrive."""
    with phone() as p:
        for delta in p.chat_stream(prompt, system=system):
            print(delta, end="", flush=True)
        print()


# ---------------------------------------------------------------- vision


@app.command()
def ocr(image: Path = IMAGE, languages: str | None = typer.Option(None, help="e.g. en-US,da")) -> None:
    """Recognize text in an image."""
    with phone() as p:
        print(p.ocr(image, languages=languages)["text"])


@app.command()
def classify(image: Path = IMAGE, top_k: int = typer.Option(10)) -> None:
    """Classify an image (~1000 labels)."""
    with phone() as p:
        classifications = p.classify(image, top_k=top_k)["classifications"]
        if not classifications:
            logger.info("no classifications above the confidence threshold")
        for item in classifications:
            print(f"{item['confidence']:6.1%}  {item['label']}")


@app.command()
def barcodes(image: Path = IMAGE) -> None:
    """Detect QR/EAN/… codes."""
    with phone() as p:
        dump(p.barcodes(image))


@app.command()
def faces(image: Path = IMAGE) -> None:
    """Detect faces with angles and landmarks."""
    with phone() as p:
        dump(p.faces(image))


@app.command()
def pose(image: Path = IMAGE) -> None:
    """Body-pose joints per person."""
    with phone() as p:
        dump(p.body_pose(image))


@app.command(name="hand-pose")
def hand_pose(image: Path = IMAGE, max_hands: int = typer.Option(2)) -> None:
    """Hand joints with chirality."""
    with phone() as p:
        dump(p.hand_pose(image, max_hands=max_hands))


@app.command()
def document(
    image: Path = IMAGE, out: Path = typer.Option(Path("corrected.png"), help="Corrected scan output")
) -> None:
    """Detect a document and save the perspective-corrected scan."""
    with phone() as p:
        result = p.scan_document(image, out)
        if result.pop("corrected", None):
            logger.success(f"saved corrected scan to {out}")
        dump(result)


@app.command(name="feature-print")
def feature_print(image: Path = IMAGE) -> None:
    """Image embedding vector (summary only)."""
    with phone() as p:
        result = p.feature_print(image)
        print(
            f"{result['element_count']} floats, first 8: "
            f"{[round(v, 4) for v in result['embedding'][:8]]}"
        )


@app.command(name="remove-bg")
def remove_bg(image: Path = IMAGE, out: Path = typer.Option(Path("cutout.png"))) -> None:
    """Remove the background (subject cutout PNG)."""
    with phone() as p:
        logger.success(f"saved {p.remove_background(image, out)}")


@app.command(name="person-seg")
def person_seg(
    image: Path = IMAGE,
    out: Path = typer.Option(Path("mask.png")),
    quality: SegQuality = typer.Option(SegQuality.balanced),
) -> None:
    """Person segmentation mask PNG."""
    with phone() as p:
        logger.success(f"saved {p.person_segmentation(image, out, quality=quality.value)}")


@app.command(name="similar-images")
def similar_images(image_a: Path = IMAGE, image_b: Path = IMAGE) -> None:
    """Distance between two images (lower = more similar)."""
    with phone() as p:
        dump(p.similarity(image_a, image_b))


@app.command(name="image-gen")
def image_gen(
    prompt: str,
    out: Path = typer.Option(Path("generated.png")),
    style: str | None = typer.Option(None, help="animation | illustration | sketch"),
) -> None:
    """Generate an image (needs Apple Intelligence)."""
    with phone() as p:
        out.write_bytes(p.generate_image(prompt, style=style)[0])
        logger.success(f"saved {out}")


@app.command()
def styles() -> None:
    """Image-generation styles available on the device."""
    with phone() as p:
        dump(p.image_styles())


# ------------------------------------------------------------------ text


@app.command()
def analyze(text: str) -> None:
    """Language, sentiment, entities and tokens."""
    with phone() as p:
        dump(p.analyze_text(text))


@app.command()
def embed(texts: list[str] = typer.Argument(..., help="One or more texts")) -> None:
    """Sentence embeddings (summary only)."""
    with phone() as p:
        result = p.embed_text(*texts)
        print(f"{len(result['embeddings'])} × {result['dimension']}-dim ({result.get('language', '?')})")


@app.command(name="similar-text")
def similar_text(text_a: str, text_b: str) -> None:
    """Semantic distance between two texts."""
    with phone() as p:
        dump(p.text_similarity(text_a, text_b))


@app.command()
def translate(
    text: str,
    target: str = typer.Option(..., help="Target language, e.g. de"),
    source: str | None = typer.Option(None, help="Source language (auto-detected if omitted)"),
) -> None:
    """Offline translation (pairs must be downloaded on the phone)."""
    with phone() as p:
        print(p.translate(text, target=target, source=source))


@app.command()
def languages(
    source: str | None = typer.Option(None), target: str | None = typer.Option(None)
) -> None:
    """Translation languages; pass --source/--target to check a pair."""
    with phone() as p:
        dump(p.translation_languages(source=source, target=target))


# ----------------------------------------------------------------- audio


@app.command()
def speak(
    text: str,
    out: Path = typer.Option(Path("speech.wav")),
    voice: str | None = typer.Option(None, help="Voice identifier or language code"),
) -> None:
    """Text-to-speech, saved as WAV."""
    with phone() as p:
        logger.success(f"saved {p.speak(text, out, voice=voice)}")


@app.command()
def voices() -> None:
    """All installed voices."""
    with phone() as p:
        for voice in p.voices():
            print(f"{voice['language']:8s} {voice['quality']:9s} {voice['name']:24s} {voice['identifier']}")


@app.command()
def transcribe(audio: Path = AUDIO, locale: str = typer.Option("en-US")) -> None:
    """On-device speech-to-text."""
    with phone() as p:
        print(p.transcribe(audio, locale=locale)["text"])


@app.command()
def locales() -> None:
    """Transcription languages: supported vs installed."""
    with phone() as p:
        dump(p.transcribe_locales())


@app.command()
def sound(audio: Path = AUDIO) -> None:
    """Classify sound events."""
    with phone() as p:
        top = p.classify_sound(audio)["top"]
        if not top:
            logger.info("no confident sound events in this clip")
        for item in top:
            print(f"{item['confidence']:6.1%}  {item['label']}")


@app.command()
def labels() -> None:
    """All ~300 sound-classifier labels."""
    with phone() as p:
        for label in p.sound_labels():
            print(label)


@app.command()
def shazam(audio: Path = AUDIO) -> None:
    """Identify a song (needs internet)."""
    with phone() as p:
        dump(p.shazam(audio))


def run() -> None:
    try:
        app()
    except SidecarError as error:
        logger.error(str(error))
        raise SystemExit(1)


if __name__ == "__main__":
    run()
