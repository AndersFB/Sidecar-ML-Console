"""Async HTTP transport to the phone, plus the live capability cache.

Mirrors the helper shapes already proven in `examples/python/fastapi_proxy.py`
rather than `examples/python/client.py`, which is synchronous and writes results
to disk. The phone's error envelope is translated into `ToolError` so the
message reaches the agent verbatim.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastmcp.exceptions import ToolError
from loguru import logger

# The phone times out at 120 s, but heavy models queue server-side rather than
# fail, so the client must wait longer than the server's own ceiling.
DEFAULT_TIMEOUT = 180.0

# Short, so a wrong address reports quickly instead of hanging the agent.
CONNECT_TIMEOUT = 5.0

# Availability is re-evaluated by the phone on every call (a capability can flip
# to true once a model finishes downloading), so the cache has to expire.
CAPABILITY_TTL = 30.0


class Connection:
    """Holds the shared `httpx.AsyncClient` and the cached capability list."""

    def __init__(
        self,
        base_url: str,
        token: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        # Injectable so tests can drive a fake phone without a real socket.
        self._transport = transport
        self._client = self._build()
        self._capabilities: list[dict] | None = None
        self._fetched_at = 0.0

    def _build(self) -> httpx.AsyncClient:
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            # Connect fast so a wrong address fails in seconds rather than
            # hanging the agent for the full read timeout; read slowly because
            # the phone queues heavy models rather than rejecting them.
            timeout=httpx.Timeout(
                connect=CONNECT_TIMEOUT, read=self.timeout, write=30.0, pool=5.0
            ),
            # The phone runs 2 vision requests concurrently and 1 each for
            # chat/speech/sound/Shazam/image-gen. Fanning out further just
            # builds a server-side queue.
            limits=httpx.Limits(max_connections=8, max_keepalive_connections=4),
            # An ambient HTTP_PROXY/HTTPS_PROXY must never intercept traffic to
            # a LAN address — that failure looks like an unreachable phone.
            trust_env=False,
            transport=self._transport,
        )

    async def reconnect(self, base_url: str, token: str | None) -> None:
        """Point at a different phone, dropping the old client and cache."""
        await self.aclose()
        self.base_url = base_url.rstrip("/")
        self.token = token
        self._client = self._build()
        self.invalidate()

    async def aclose(self) -> None:
        await self._client.aclose()

    def invalidate(self) -> None:
        self._capabilities = None
        self._fetched_at = 0.0

    # ---------------------------------------------------------------- core

    def _check(self, response: httpx.Response) -> Any:
        label = f"{response.request.method} {response.request.url.path}"
        if response.is_error:
            code, message = self._unwrap_error(response)
            logger.warning(f"{label} → {response.status_code} [{code}]: {message}")
            raise ToolError(self._explain(response.status_code, code, message))
        logger.info(f"{label} → {response.status_code}")
        return response.json()

    @staticmethod
    def _unwrap_error(response: httpx.Response) -> tuple[str, str]:
        try:
            error = response.json()["error"]
            return str(error["code"]), str(error["message"])
        except (KeyError, ValueError, TypeError):
            return f"http_{response.status_code}", response.text[:400] or response.reason_phrase

    @staticmethod
    def _explain(status: int, code: str, message: str) -> str:
        """Turn the phone's error into something an agent can act on."""
        if code == "capability_unavailable":
            return f"The phone cannot run this: {message}"
        if code == "busy":
            return f"The phone's model is busy ({message}). Retry in a moment."
        if code == "payload_too_large":
            return f"Input too large for the phone's 50 MB cap: {message}"
        if code == "unauthorized":
            return (
                f"The phone rejected the bearer token: {message} "
                "Set SIDECAR_TOKEN or pass a token to sidecar_connect."
            )
        if code == "not_implemented":
            return f"Not available for this input: {message}"
        return f"[{status} {code}] {message}"

    def _unreachable(self, exc: Exception) -> ToolError:
        return ToolError(
            f"Could not reach a Sidecar ML phone at {self.base_url} ({exc}). "
            "Check the iPhone is awake with the app in the foreground on the same "
            "network, then use sidecar_discover to find it or sidecar_connect to "
            "set the address."
        )

    async def get(self, path: str, params: dict | None = None) -> Any:
        try:
            response = await self._client.get(path, params=_clean(params))
        except httpx.HTTPError as exc:
            raise self._unreachable(exc) from exc
        return self._check(response)

    async def post_json(self, path: str, body: dict) -> Any:
        try:
            response = await self._client.post(path, json=_clean(body))
        except httpx.HTTPError as exc:
            raise self._unreachable(exc) from exc
        return self._check(response)

    async def post_raw(
        self,
        path: str,
        data: bytes,
        content_type: str,
        params: dict | None = None,
    ) -> Any:
        """Post binary as the raw request body — the phone takes no multipart."""
        try:
            response = await self._client.post(
                path,
                content=data,
                params=_clean(params),
                headers={"Content-Type": content_type},
            )
        except httpx.HTTPError as exc:
            raise self._unreachable(exc) from exc
        return self._check(response)

    # -------------------------------------------------------- capabilities

    async def capabilities(self, force: bool = False) -> list[dict]:
        """Cached `GET /v1/capabilities`, refreshed after CAPABILITY_TTL."""
        fresh = time.monotonic() - self._fetched_at < CAPABILITY_TTL
        if self._capabilities is not None and fresh and not force:
            return self._capabilities
        result = await self.get("/v1/capabilities")
        if not isinstance(result, list):
            raise ToolError("Unexpected /v1/capabilities response — expected a JSON array.")
        self._capabilities = result
        self._fetched_at = time.monotonic()
        return result

    async def capability_for_route(self, route: str) -> dict | None:
        """Find the capability serving `"POST /v1/vision/ocr"`-style route."""
        for capability in await self.capabilities():
            if route in capability.get("endpoints", []):
                return capability
        return None

    async def require(self, route: str) -> None:
        """Raise with the phone's own reason if `route`'s capability is off.

        Belt-and-braces alongside tool gating: a host that caches the tool list
        would otherwise call a tool the phone can no longer serve.
        """
        try:
            capability = await self.capability_for_route(route)
        except ToolError:
            return  # Capability probe failed; let the real call report the error.
        if capability is not None and not capability.get("available", True):
            reason = capability.get("reason", "no reason given")
            raise ToolError(
                f"'{capability.get('name', route)}' is unavailable on this phone: {reason}"
            )


def _clean(mapping: dict | None) -> dict:
    """Drop None values — the API omits absent fields rather than sending null."""
    return {k: v for k, v in (mapping or {}).items() if v is not None}
