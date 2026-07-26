"""Bonjour discovery of Sidecar ML phones on the LAN.

`examples/python/discover.py` prints and blocks on `time.sleep`, so it cannot be
reused from an async server. Same service type, same resolution, but this
collects into a list and browses on the event loop.
"""

from __future__ import annotations

import asyncio
import contextlib

from loguru import logger
from zeroconf import IPVersion, ServiceStateChange, Zeroconf
from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf

SERVICE_TYPE = "_sidecarml._tcp.local."


async def _resolve(zeroconf: Zeroconf, name: str) -> dict | None:
    info = AsyncServiceInfo(SERVICE_TYPE, name)
    if not await info.async_request(zeroconf, 3000):
        return None
    addresses = info.parsed_addresses(IPVersion.V4Only) or info.parsed_addresses()
    if not addresses:
        return None
    properties = {
        key.decode(errors="replace") if isinstance(key, bytes) else str(key): (
            value.decode(errors="replace") if isinstance(value, bytes) else value
        )
        for key, value in (info.properties or {}).items()
    }
    return {
        "name": name.removesuffix("." + SERVICE_TYPE),
        "url": f"http://{addresses[0]}:{info.port}",
        "addresses": addresses,
        "port": info.port,
        "properties": properties,
    }


async def discover(timeout: float = 5.0) -> list[dict]:
    """Browse the LAN for `_sidecarml._tcp` and return every phone found."""
    found: dict[str, dict] = {}
    pending: set[asyncio.Task] = set()

    async_zeroconf = AsyncZeroconf()

    def on_change(
        zeroconf: Zeroconf,
        service_type: str,
        name: str,
        state_change: ServiceStateChange,
        **_: object,
    ) -> None:
        if state_change is not ServiceStateChange.Removed and name not in found:
            task = asyncio.ensure_future(_collect(zeroconf, name))
            pending.add(task)
            task.add_done_callback(pending.discard)

    async def _collect(zeroconf: Zeroconf, name: str) -> None:
        try:
            entry = await _resolve(zeroconf, name)
        except Exception as exc:  # a single bad responder must not sink the browse
            logger.warning(f"could not resolve {name}: {exc}")
            return
        if entry:
            found[name] = entry
            logger.info(f"discovered {entry['name']} at {entry['url']}")

    browser = AsyncServiceBrowser(
        async_zeroconf.zeroconf, SERVICE_TYPE, handlers=[on_change]
    )
    try:
        await asyncio.sleep(max(0.5, timeout))
        if pending:
            await asyncio.wait(pending, timeout=3.0)
    finally:
        await browser.async_cancel()
        await async_zeroconf.async_close()
        for task in pending:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

    return sorted(found.values(), key=lambda entry: entry["name"])
