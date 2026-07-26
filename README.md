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
| [`mcp/`](mcp/) | MCP server — lets an AI agent use the phone's ML as tools |
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
# pip install openai
from openai import OpenAI
phone = OpenAI(base_url="http://192.168.1.20:8080/v1", api_key="unused")
```

**5. AI agents (MCP)** — give an assistant the phone's ML as tools. Run the
server on a machine that can see the phone, then point your MCP client at it:

```bash
cd mcp && uv venv && uv pip install -e .
SIDECAR_URL=http://192.168.1.20:8080 sidecar-ml-mcp
```

See [`mcp/`](mcp/) for client config and the tool list.

## Connecting without Wi-Fi (USB)

No network to share? Plug the iPhone into the computer with its charging cable.
The cable alone gives the computer no route to the phone, so pick one of the two
setups below — both work with the phone's Wi-Fi switched off, and neither needs
any change to the console or the examples.

**Personal Hotspot over USB** — nothing extra to install on macOS. On the phone:
Settings → Personal Hotspot → **Allow Others to Join**, then plug in and tap
Trust. iOS brings up a USB Ethernet link (the Wi-Fi radio is not in the path)
and the phone becomes the gateway at a fixed address:

```bash
curl http://172.20.10.1:8080/health
```

Use `http://172.20.10.1:8080` anywhere this repo asks for the phone's address.
This needs a carrier plan that allows hotspot — a SIM-less iPhone often has no
Personal Hotspot section at all. On macOS, drag **iPhone USB** below Wi-Fi under
System Settings → Network → ⋯ → Set Service Order so the computer keeps its own
internet route while still reaching the phone. Windows needs Apple's Mobile
Device Ethernet driver (iTunes / Apple Devices app); Linux needs the `ipheth`
module plus `usbmuxd`.

**usbmuxd port forwarding** — no hotspot and no cellular plan required, at the
cost of one extra tool. `usbmuxd` tunnels TCP over the cable to a paired device:

```bash
brew install libimobiledevice   # Linux: apt install usbmuxd libimobiledevice-utils
iproxy 8080:8080                # older builds: iproxy 8080 8080
curl http://127.0.0.1:8080/health
```

`http://127.0.0.1:8080` is already the default address for the console, the
Python examples and the MCP server, so they all connect unconfigured while the
forward is running.

Either way, the app still has to be in the **foreground**, and the console must
be served over `http://localhost` (never `https://`) — an https page would block
plain-HTTP requests to the phone as mixed content. Bonjour discovery may not
cross the USB link, so enter the address by hand rather than relying on
[`discover.py`](examples/python/discover.py).

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
