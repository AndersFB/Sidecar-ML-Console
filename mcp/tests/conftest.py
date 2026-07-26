from __future__ import annotations

import httpx
import pytest
import pytest_asyncio

from sidecar_ml_mcp import state as state_module
from sidecar_ml_mcp.connection import Connection

from . import fake_phone


@pytest.fixture
def phone_state():
    fake_phone.state.reset()
    yield fake_phone.state
    fake_phone.state.reset()


@pytest_asyncio.fixture
async def phone(phone_state) -> Connection:
    """A Connection wired to the fake phone over ASGI — no sockets involved."""
    connection = Connection(
        base_url="http://phone.test",
        transport=httpx.ASGITransport(app=fake_phone.app),
    )
    state_module._connection = connection
    try:
        yield connection
    finally:
        await connection.aclose()
        state_module._connection = None


@pytest_asyncio.fixture
async def client(phone, monkeypatch):
    """An in-memory MCP client whose lifespan adopts the fake-phone connection."""
    from fastmcp.client import Client

    from sidecar_ml_mcp import server as server_module

    monkeypatch.setattr(server_module, "init_connection", lambda **_: phone)
    monkeypatch.setattr(server_module, "close_connection", _noop)

    async with Client(server_module.mcp) as mcp_client:
        yield mcp_client

    # Undo any gating this test's connect/refresh applied, so tool visibility
    # does not leak into the next test through the module-level server object.
    server_module.mcp.enable(names=set(fake_phone_tool_names()))


async def _noop() -> None:
    return None


def fake_phone_tool_names() -> set[str]:
    from sidecar_ml_mcp.gating import tool_routes

    return set(tool_routes())


@pytest.fixture
def png_bytes() -> bytes:
    return fake_phone.PNG


@pytest.fixture
def wav_bytes() -> bytes:
    return fake_phone.WAV
