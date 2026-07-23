# Sidecar ML — your iPhone as a local ML server

Web console, Python examples and API docs for **Sidecar ML**, an iOS app that
turns an iPhone into a private, zero-cost machine-learning server for your home
network. The app exposes Apple's on-device models over plain HTTP: OCR,
background removal, face/pose detection, document scanning, image embeddings,
speech-to-text, text-to-speech, offline translation, NLP, sound classification,
Shazam — and the Apple Intelligence LLM behind an **OpenAI-compatible**
`/v1/chat/completions` endpoint.

> **Get the app:** [Download Sidecar ML on the App Store](https://apps.apple.com/app/id6793297547)

```
┌─ iPhone: "Sidecar ML" app ────────────────────────────┐
│  HTTP server · 12 on-device capabilities · Bonjour    │
└──────────────── http://<phone-ip>:8080 ───────────────┘
        ▲ REST + SSE (curl · Python · OpenAI SDK)
        ▲ React web console (this repo)
```

## What's in this repo

| Path | What |
|---|---|
| [`webapp/`](webapp/) | React + Vite web console with a panel for every capability, webcam photo capture and live face & pose detection, and a built-in API reference |
| [`examples/python/`](examples/python/) | `httpx` client, CLI, FastAPI integration, Bonjour discovery |
| [`docs/API.md`](docs/API.md) | Full HTTP API reference |

## Quickstart

**1. Run the app** — [install Sidecar ML from the App Store](https://apps.apple.com/app/id6793297547),
open it and tap **Start Server**. The dashboard shows the URL
(e.g. `http://192.168.1.20:8080`) plus a QR code. Keep the app in the
foreground — iOS suspends network servers in the background (there's a
keep-awake toggle).

**2. Try it from your Mac/PC:**

```bash
curl http://192.168.1.20:8080/health
curl http://192.168.1.20:8080/v1/capabilities
curl http://192.168.1.20:8080/v1/vision/ocr \
     -H 'Content-Type: image/jpeg' --data-binary @receipt.jpg
```

**3. Web console** — download the ready-made single-file console
([`sidecar-ml-console.html`](https://github.com/AndersFB/Sidecar-ML-Console/releases/latest/download/sidecar-ml-console.html)
from the latest release), open it in your browser and enter the phone's
address — or run the dev server:

```bash
cd webapp && npm install && npm run dev
# open http://localhost:5173 and enter the phone's address
```

**4. Python / OpenAI SDK:** see [`examples/python/`](examples/python/).

```python
from openai import OpenAI
phone = OpenAI(base_url="http://192.168.1.20:8080/v1", api_key="unused")
```

## Notes

- **Availability is honest**: `GET /v1/capabilities` reports per-capability
  status with reasons (e.g. the LLM and image generation need an
  Apple Intelligence-capable iPhone; translation language pairs must be
  downloaded in the app first).
- **Security**: the server is open on your LAN by default. Enable the bearer
  token in the app's Settings if you don't trust the network; the console and
  all examples accept a token. Everything runs on-device; only Shazam catalog
  matching calls out to Apple.
- **Tests**: the webapp has a Vitest suite (`cd webapp && npm test`). The
  server's own test suites live with the iOS app.
