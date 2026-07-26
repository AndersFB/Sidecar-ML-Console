"""Text tools — NLP analysis, embeddings and offline translation."""

from __future__ import annotations

import json

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError

from ..media import save_bytes
from ..state import get_connection

ROUTES = {
    "analyze_text": "POST /v1/nlp/analyze",
    "embed_text": "POST /v1/nlp/embed",
    "compare_texts": "POST /v1/nlp/similarity",
    "translate_text": "POST /v1/translation/translate",
    "list_translation_languages": "GET /v1/translation/languages",
}

VALID_FEATURES = {"language", "sentiment", "entities", "tokens"}


def register(mcp: FastMCP) -> None:
    @mcp.tool(tags={"text"}, annotations={"readOnlyHint": True})
    async def analyze_text(text: str, features: list[str] | None = None) -> dict:
        """Detect language, sentiment, named entities and tokens in text.

        Args:
            text: The text to analyse.
            features: Subset of ["language", "sentiment", "entities", "tokens"].
                Defaults to all four. Narrow it to keep the response small —
                "tokens" returns a lemma and part of speech for every word.
        """
        if features:
            unknown = set(features) - VALID_FEATURES
            if unknown:
                raise ToolError(
                    f"Unknown features {sorted(unknown)}. Valid: {sorted(VALID_FEATURES)}."
                )
        phone = get_connection()
        await phone.require(ROUTES["analyze_text"])
        return await phone.post_json(
            "/v1/nlp/analyze", {"text": text, "features": features}
        )

    @mcp.tool(tags={"text"}, annotations={"readOnlyHint": True})
    async def embed_text(texts: list[str], save_path: str | None = None) -> dict:
        """Compute sentence embeddings for one or more texts.

        Returns dimensions and a short preview rather than the raw vectors, which
        are not useful as text. Pass save_path to write them all to disk as JSON.

        Args:
            texts: One or more strings to embed.
            save_path: Optional path to write the full embeddings as JSON.
        """
        if not texts:
            raise ToolError("Pass at least one text to embed.")
        phone = get_connection()
        await phone.require(ROUTES["embed_text"])
        result = await phone.post_json("/v1/nlp/embed", {"texts": list(texts)})
        embeddings = result.get("embeddings", [])
        summary = {
            "count": len(embeddings),
            "dimension": result.get("dimension"),
            "language": result.get("language"),
            "preview": [round(v, 4) for v in (embeddings[0][:8] if embeddings else [])],
            "note": "Full vectors omitted; pass save_path to write them to disk.",
        }
        if save_path:
            summary["saved_to"] = save_bytes(json.dumps(result).encode(), save_path)
            summary.pop("note")
        return summary

    @mcp.tool(tags={"text"}, annotations={"readOnlyHint": True})
    async def compare_texts(text_a: str, text_b: str) -> dict:
        """Measure semantic similarity between two texts.

        Returns cosine similarity (higher is closer) and distance (lower is closer).

        Args:
            text_a: First text.
            text_b: Text to compare against.
        """
        phone = get_connection()
        await phone.require(ROUTES["compare_texts"])
        return await phone.post_json(
            "/v1/nlp/similarity", {"text_a": text_a, "text_b": text_b}
        )

    @mcp.tool(tags={"text"}, annotations={"readOnlyHint": True})
    async def translate_text(
        target: str,
        text: str | None = None,
        texts: list[str] | None = None,
        source: str | None = None,
    ) -> dict:
        """Translate text between languages, fully offline on the phone.

        The language pair must be downloaded on the device — check with
        list_translation_languages, which reports pair_status.

        Args:
            target: Target language code, e.g. "de", "fr", "ja". Required.
            text: A single string to translate.
            texts: A batch of strings to translate (up to 100). Use instead of text.
            source: Source language code. Omit to auto-detect per text.
        """
        if not text and not texts:
            raise ToolError("Pass either text or texts.")
        if text and texts:
            raise ToolError("Pass either text or texts, not both.")
        phone = get_connection()
        await phone.require(ROUTES["translate_text"])
        body: dict = {"target": target, "source": source}
        if texts:
            body["texts"] = list(texts)
        else:
            body["text"] = text
        result = await phone.post_json("/v1/translation/translate", body)
        translations = [item.get("text", "") for item in result.get("translations", [])]
        return {"translations": translations, "target": target}

    @mcp.tool(tags={"text"}, annotations={"readOnlyHint": True})
    async def list_translation_languages(
        target: str | None = None, source: str | None = None
    ) -> dict:
        """List translation languages, and whether a specific pair is ready.

        Args:
            target: Pass a target language to also get pair_status —
                "installed", "supported" (needs download) or "unsupported".
            source: Source language for the pair check. Only meaningful with target.
        """
        phone = get_connection()
        await phone.require(ROUTES["list_translation_languages"])
        return await phone.get(
            "/v1/translation/languages", {"target": target, "source": source}
        )
