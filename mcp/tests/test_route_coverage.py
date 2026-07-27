"""Drift tripwire: the tool set must cover every documented route, exactly once.

The Python analogue of `webapp/src/test/ApiDocsPanel.test.tsx`. CLAUDE.md
requires an endpoint change to land across every client surface in lockstep;
this file fails when the MCP server is the one left behind.

The route list is hardcoded on purpose — deriving it from the same code under
test would defeat the point.
"""

from __future__ import annotations

import pytest
from fastmcp.client import Client

from sidecar_ml_mcp.gating import ALWAYS_ON, tool_routes
from sidecar_ml_mcp.server import mcp

# All 43 routes from docs/API.md.
ALL_ROUTES = {
    "GET /",
    "GET /health",
    "GET /v1/capabilities",
    "GET /v1/models",
    "POST /v1/chat/completions",
    "POST /v1/vision/ocr",
    "POST /v1/vision/barcodes",
    "POST /v1/vision/classify",
    "POST /v1/vision/feature-print",
    "POST /v1/vision/similarity",
    "POST /v1/vision/subject-mask",
    "POST /v1/vision/person-segmentation",
    "POST /v1/vision/faces",
    "POST /v1/vision/body-pose",
    "POST /v1/vision/hand-pose",
    "POST /v1/vision/document",
    "POST /v1/images/generations",
    "POST /v1/images/stylize",
    "GET /v1/images/styles",
    "POST /v1/speech/speak",
    "GET /v1/speech/voices",
    "POST /v1/speech/transcribe",
    "GET /v1/speech/transcribe/locales",
    "GET /v1/voice/presets",
    "POST /v1/voice/transform",
    "POST /v1/voice/analyze",
    "POST /v1/voice/match",
    "POST /v1/voice/respeak",
    "GET /v1/voice/stream",
    "GET /v1/voice/broadcast",
    "GET /v1/face/presets",
    "POST /v1/face/transform",
    "POST /v1/face/swap",
    "GET /v1/face/stream",
    "GET /v1/face/broadcast",
    "GET /v1/translation/languages",
    "POST /v1/translation/translate",
    "POST /v1/nlp/analyze",
    "POST /v1/nlp/embed",
    "POST /v1/nlp/similarity",
    "POST /v1/sound/classify",
    "GET /v1/sound/labels",
    "POST /v1/shazam/match",
}

# Folded into sidecar_status / sidecar_capabilities rather than given their own
# tools — three near-identical "what is this server" tools would just make an
# agent pick among them at random.
FOLDED_INTO_CONNECTION_TOOLS = {"GET /", "GET /health", "GET /v1/capabilities"}

# Long-lived streams, deliberately not exposed as tools. A WebSocket or a
# minutes-long MJPEG body has no meaning inside one request/response tool call,
# and the phone admits exactly one session per modality — an agent holding one
# would lock the user out of their own console. Listed here so the coverage
# assertion stays honest rather than being quietly loosened.
STREAMING_NOT_EXPOSED = {
    "GET /v1/voice/stream",
    "GET /v1/voice/broadcast",
    "GET /v1/face/stream",
    "GET /v1/face/broadcast",
}


def test_every_route_has_a_tool():
    covered = (
        set(tool_routes().values()) | FOLDED_INTO_CONNECTION_TOOLS | STREAMING_NOT_EXPOSED
    )
    assert ALL_ROUTES - covered == set(), "routes with no MCP tool"


def test_no_tool_points_at_an_unknown_route():
    assert set(tool_routes().values()) - ALL_ROUTES == set(), "tools pointing at unknown routes"


def test_streaming_routes_are_real_routes():
    """The exclusion list must name routes that exist, or it hides a real gap."""
    assert STREAMING_NOT_EXPOSED <= ALL_ROUTES
    assert not (STREAMING_NOT_EXPOSED & set(tool_routes().values()))


def test_each_route_is_claimed_by_exactly_one_tool():
    routes = list(tool_routes().values())
    duplicates = {route for route in routes if routes.count(route) > 1}
    assert not duplicates, f"routes claimed by more than one tool: {duplicates}"


async def test_all_tools_are_registered_and_described():
    async with Client(mcp) as client:
        tools = await client.list_tools()
    names = {tool.name for tool in tools}

    assert set(tool_routes()) <= names, "declared route tools missing from the server"
    assert ALWAYS_ON <= names, "connection tools must always be advertised"

    for tool in tools:
        assert tool.description, f"{tool.name} has no description"


@pytest.mark.parametrize("name", sorted(ALWAYS_ON))
def test_connection_tools_are_never_route_gated(name: str):
    """Gating these would strand an agent with no way back to a phone."""
    assert name not in tool_routes()
