"""Image generation and the phone's on-device chat model."""

from __future__ import annotations

import base64

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.utilities.types import Image

from ..media import save_bytes
from ..state import get_connection

ROUTES = {
    "generate_image": "POST /v1/images/generations",
    "list_image_styles": "GET /v1/images/styles",
    "phone_chat": "POST /v1/chat/completions",
    "list_models": "GET /v1/models",
}


def register(mcp: FastMCP) -> None:
    @mcp.tool(tags={"image-gen"}, output_schema=None)
    async def generate_image(
        prompt: str,
        n: int = 1,
        style: str | None = None,
        save_path: str | None = None,
    ) -> list:
        """Generate images from a text prompt using the phone's Image Playground.

        Requires Apple Intelligence, and the app must be in the foreground.

        Args:
            prompt: What to draw.
            n: How many images to generate, 1-4.
            style: A style from list_image_styles, e.g. "illustration",
                "animation", "sketch". Device-dependent.
            save_path: Optional path to write the first image. With n > 1 the rest
                get a numeric suffix.
        """
        phone = get_connection()
        await phone.require(ROUTES["generate_image"])
        result = await phone.post_json(
            "/v1/images/generations", {"prompt": prompt, "n": n, "style": style}
        )
        blocks: list = []
        saved: list[str] = []
        items = result.get("data", [])
        for index, item in enumerate(items):
            try:
                data = base64.b64decode(item["b64_json"])
            except (KeyError, ValueError) as exc:
                raise ToolError(f"Malformed image in the response: {exc}") from exc
            blocks.append(Image(data=data, format="png"))
            if save_path:
                target = save_path
                if len(items) > 1:
                    stem, _, ext = save_path.rpartition(".")
                    target = f"{stem}-{index + 1}.{ext}" if stem else f"{save_path}-{index + 1}"
                saved.append(save_bytes(data, target))
        summary: dict = {"count": len(blocks), "prompt": prompt}
        if style:
            summary["style"] = style
        if saved:
            summary["saved_to"] = saved
        blocks.append(summary)
        return blocks

    @mcp.tool(tags={"image-gen"}, annotations={"readOnlyHint": True})
    async def list_image_styles() -> dict:
        """List the image-generation styles this phone supports."""
        phone = get_connection()
        await phone.require(ROUTES["list_image_styles"])
        return await phone.get("/v1/images/styles")

    @mcp.tool(tags={"chat"}, annotations={"readOnlyHint": True})
    async def phone_chat(
        prompt: str | None = None,
        messages: list[dict] | None = None,
        system: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        json_schema: dict | None = None,
    ) -> dict:
        """Run a prompt against the phone's small on-device language model.

        This is Apple Intelligence's ~3B model. It is far weaker than a frontier
        model, so use it only when the point is that generation stays on the
        device (privacy, offline), or to verify the phone's LLM works — not as a
        general reasoning aid.

        Args:
            prompt: A single user prompt. Use this or messages, not both.
            messages: Full chat history as [{"role": "user", "content": "..."}].
                Roles: system, user, assistant.
            system: Optional system prompt, prepended when using prompt.
            temperature: Sampling temperature.
            max_tokens: Maximum tokens to generate.
            json_schema: A JSON Schema object to enforce structured output.
                Supports object/string/number/integer/boolean/enum/array.
        """
        if not prompt and not messages:
            raise ToolError("Pass either prompt or messages.")
        if prompt and messages:
            raise ToolError("Pass either prompt or messages, not both.")
        phone = get_connection()
        await phone.require(ROUTES["phone_chat"])

        if messages is None:
            messages = ([{"role": "system", "content": system}] if system else []) + [
                {"role": "user", "content": prompt}
            ]
        body: dict = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_schema:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "response", "schema": json_schema},
            }
        result = await phone.post_json("/v1/chat/completions", body)
        try:
            choice = result["choices"][0]
        except (KeyError, IndexError) as exc:
            raise ToolError(f"Unexpected chat response from the phone: {exc}") from exc
        return {
            "content": choice.get("message", {}).get("content", ""),
            "finish_reason": choice.get("finish_reason"),
            "usage": result.get("usage"),
        }

    @mcp.tool(tags={"chat"}, annotations={"readOnlyHint": True})
    async def list_models() -> dict:
        """List chat models the phone exposes (OpenAI-style).

        An empty list means the on-device LLM is unavailable on this device.
        """
        phone = get_connection()
        await phone.require(ROUTES["list_models"])
        return await phone.get("/v1/models")
