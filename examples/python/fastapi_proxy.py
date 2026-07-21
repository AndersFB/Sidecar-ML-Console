"""Example: a FastAPI service that uses the iPhone as its ML backend.

Run:
    uvicorn fastapi_proxy:app --reload

Then:
    curl -F "file=@receipt.jpg" http://127.0.0.1:8000/extract-text
    curl -X POST http://127.0.0.1:8000/ask -H 'Content-Type: application/json' \
         -d '{"question": "What is OCR?"}'

Set SIDECAR_URL to your phone's address (see the ML Sidecar app's dashboard).
"""

from __future__ import annotations

import os

import httpx
from fastapi import FastAPI, HTTPException, UploadFile
from pydantic import BaseModel

SIDECAR_URL = os.environ.get("SIDECAR_URL", "http://127.0.0.1:8080")
SIDECAR_TOKEN = os.environ.get("SIDECAR_TOKEN")

app = FastAPI(title="ML Sidecar proxy example")


def phone_client() -> httpx.AsyncClient:
    headers = {"Authorization": f"Bearer {SIDECAR_TOKEN}"} if SIDECAR_TOKEN else {}
    return httpx.AsyncClient(base_url=SIDECAR_URL, headers=headers, timeout=120)


async def forward_error(response: httpx.Response) -> None:
    if response.is_error:
        try:
            detail = response.json()["error"]["message"]
        except Exception:  # noqa: BLE001
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)


@app.get("/phone")
async def phone_status() -> dict:
    """Health + capability overview of the connected iPhone."""
    async with phone_client() as client:
        health = await client.get("/health")
        await forward_error(health)
        capabilities = await client.get("/v1/capabilities")
        await forward_error(capabilities)
        return {
            "health": health.json(),
            "capabilities": [
                {"id": c["id"], "available": c["available"]} for c in capabilities.json()
            ],
        }


@app.post("/extract-text")
async def extract_text(file: UploadFile) -> dict:
    """OCR an uploaded image on the iPhone."""
    payload = await file.read()
    async with phone_client() as client:
        response = await client.post(
            "/v1/vision/ocr",
            content=payload,
            headers={"Content-Type": file.content_type or "image/jpeg"},
        )
        await forward_error(response)
        result = response.json()
        return {"text": result["text"], "lines": len(result["lines"])}


class Question(BaseModel):
    question: str


@app.post("/ask")
async def ask(body: Question) -> dict:
    """Answer a question with the phone's on-device LLM."""
    async with phone_client() as client:
        response = await client.post(
            "/v1/chat/completions",
            json={"messages": [{"role": "user", "content": body.question}]},
        )
        await forward_error(response)
        return {"answer": response.json()["choices"][0]["message"]["content"]}
