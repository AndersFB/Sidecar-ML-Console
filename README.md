# Sidecar ML — your iPhone as a local ML server

Turn an iPhone into a private, zero-cost machine-learning server for your home
network. The **Sidecar ML** iOS app exposes Apple's on-device models over plain
HTTP: OCR, background removal, face/pose detection, document scanning, image
embeddings, speech-to-text, text-to-speech, offline translation, NLP, sound
classification, Shazam — and the Apple Intelligence LLM behind an
**OpenAI-compatible** `/v1/chat/completions` endpoint.

```
┌─ iPhone: "Sidecar ML" app ────────────────────────────┐
│  FlyingFox HTTP server · 12 capabilities · Bonjour    │
└──────────────── http://<phone-ip>:8080 ───────────────┘
        ▲ REST + SSE (curl · Python · OpenAI SDK)
        ▲ React web console (webapp/)
```

## Layout

| Path | What |
|---|---|
| [`My iPhone Toolkit/`](My%20iPhone%20Toolkit/) | Xcode project (own git repo). App shell + `ToolkitCore` Swift package with the server and all services |
| [`webapp/`](webapp/) | React + Vite web console with a panel for every capability |
| [`examples/python/`](examples/python/) | `httpx` client, CLI, FastAPI integration, Bonjour discovery |
| [`docs/API.md`](docs/API.md) | Full HTTP API reference |

## Quickstart

**1. Run the app** — open `My iPhone Toolkit/My iPhone Toolkit.xcodeproj` in
Xcode, run on your iPhone, tap **Start Server**. The dashboard shows the URL
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

**3. Web console:**

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
  status with reasons (e.g. the LLM and Image Playground need an
  Apple Intelligence-capable iPhone; translation pairs must be downloaded in
  the app; the iOS Simulator can't run some CoreML models).
- **Security**: the server is open on your LAN by default. Enable the bearer
  token in Settings if you don't trust the network. Everything runs on-device;
  only Shazam catalog matching calls out to Apple.
- **Tests**: `ToolkitCore` has an 84-test Swift Testing suite
  (`cd "My iPhone Toolkit/ToolkitCore" && swift test`, or run the `ToolkitCore`
  scheme on a simulator); app-level tests live in `My iPhone ToolkitTests`;
  the webapp has a Vitest suite (`cd webapp && npm test`).

## Development

- iOS server code: `My iPhone Toolkit/ToolkitCore/Sources/ToolkitCore/`
  (services are small `CapabilityService` implementations — adding an endpoint
  is one file + one registry line).
- Regenerate the app icon: `swift "My iPhone Toolkit/tools/make_icon.swift"`.
- Webapp production build: `cd webapp && npm run build`.
