"""Capability gating, and the startup path when there is no phone at all."""

from __future__ import annotations

import httpx
import pytest
import pytest_asyncio
from fastmcp.client import Client
from fastmcp.exceptions import ToolError

from sidecar_ml_mcp import server as server_module
from sidecar_ml_mcp import state as state_module
from sidecar_ml_mcp.connection import Connection
from sidecar_ml_mcp.gating import ALWAYS_ON, tool_routes

from . import fake_phone


def _dead_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("No route to host", request=request)

    return httpx.MockTransport(handler)


@pytest_asyncio.fixture
async def unreachable_client(monkeypatch):
    connection = Connection(base_url="http://192.0.2.1:8080", transport=_dead_transport())
    state_module._connection = connection
    monkeypatch.setattr(server_module, "init_connection", lambda **_: connection)
    monkeypatch.setattr(server_module, "close_connection", _noop)
    try:
        async with Client(server_module.mcp) as client:
            yield client
    finally:
        await connection.aclose()
        state_module._connection = None
        server_module.mcp.enable(names=set(tool_routes()))


async def _noop() -> None:
    return None


async def test_server_starts_with_no_phone_on_the_network(unreachable_client):
    """Failing to start would strand the agent with no way to find a phone."""
    names = {tool.name for tool in await unreachable_client.list_tools()}
    assert ALWAYS_ON <= names


async def test_unreachable_phone_leaves_every_tool_advertised(unreachable_client):
    """Nothing is known to be unavailable, so nothing is hidden."""
    names = {tool.name for tool in await unreachable_client.list_tools()}
    assert set(tool_routes()) <= names


async def test_unreachable_phone_gives_an_actionable_error(unreachable_client):
    with pytest.raises(ToolError, match="sidecar_discover"):
        await unreachable_client.call_tool("sidecar_status")


async def test_connect_regates_the_tool_list(client, phone_state):
    """Connecting to a phone with image-gen off must hide its tools."""
    phone_state.set_available("image-gen", True)
    await client.call_tool("sidecar_connect", {"base_url": "http://phone.test"})
    assert "generate_image" in {t.name for t in await client.list_tools()}

    phone_state.set_available("image-gen", False, "Not supported on this device.")
    await client.call_tool("sidecar_connect", {"base_url": "http://phone.test"})
    assert "generate_image" not in {t.name for t in await client.list_tools()}


async def test_connect_reports_what_it_hid(client):
    result = await client.call_tool("sidecar_connect", {"base_url": "http://phone.test"})
    payload = result.structured_content
    assert payload["connected_to"] == "http://phone.test"
    assert "generate_image" in payload["tools_hidden"]
    assert "image-gen" in payload["capabilities_unavailable"]


async def test_connection_tools_survive_gating(client, phone_state):
    """Every capability off must still leave a route back to a working phone."""
    for capability in phone_state.capabilities:
        capability["available"] = False
        capability["reason"] = "off"
    await client.call_tool("sidecar_connect", {"base_url": "http://phone.test"})
    names = {tool.name for tool in await client.list_tools()}
    assert ALWAYS_ON <= names


async def test_capabilities_refresh_reapplies_gating(client, phone_state):
    phone_state.set_available("image-gen", True)
    await client.call_tool("sidecar_capabilities", {"refresh": True})
    assert "generate_image" in {t.name for t in await client.list_tools()}


async def test_capability_cache_is_reused_within_its_ttl(client, phone, phone_state):
    await phone.capabilities(force=True)
    before = phone_state.capability_calls
    await phone.capabilities()
    await phone.capabilities()
    assert phone_state.capability_calls == before, "cached reads still hit the phone"


async def test_force_refresh_bypasses_the_cache(client, phone, phone_state):
    await phone.capabilities(force=True)
    before = phone_state.capability_calls
    await phone.capabilities(force=True)
    assert phone_state.capability_calls == before + 1


async def test_fake_phone_matches_the_documented_capability_ids():
    """Guards the fixture itself against drifting from docs/api/server.md."""
    documented = {
        "chat", "vision-ocr", "vision-analysis", "vision-detectors", "vision-subjects",
        "face-fx", "nlp", "speech-speak", "speech-transcribe", "voice-fx", "sound",
        "shazam", "translation", "image-gen",
    }
    assert {c["id"] for c in fake_phone.CAPABILITIES} == documented
