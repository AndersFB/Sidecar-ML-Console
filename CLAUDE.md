# Sidecar ML — web console, examples & API docs

This repo is the client side for **Sidecar ML**, an iOS app that turns an
iPhone into a private, on-device ML server on the local network (OCR, vision,
speech, translation, NLP, sound/Shazam, image gen, and an OpenAI-compatible
`/v1/chat/completions`). This repo holds the web console, Python examples, and
the HTTP API reference. The phone speaks REST + SSE over `http://<phone-ip>:8080`.

> **This is a PUBLIC repo.** Its audience installs the app from the App Store.
> Never link or reference the private iOS app repository here (README, docs,
> code, or CLAUDE) — keep it App-Store-facing only.

## Layout

- `webapp/` — the React + Vite console. The npm project is here (repo root
  → `webapp/`); run all npm commands from this subdirectory, not the repo root.
- `examples/python/` — `httpx` client, typer CLI, FastAPI proxy, Bonjour
  discovery.
- `docs/API.md` — API conventions + endpoint index; the per-area reference
  pages live in `docs/api/*.md`.

## Console (`webapp/webapp/`)

Stack: React 19, Vite 7, Tailwind 4, TypeScript ~5.8; tests via Vitest +
Testing Library + MSW.

```bash
cd webapp            # the npm project subdirectory
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest (watch);  npm run test:run for CI
npm run build        # tsc -b + vite build + single-file dist/sidecar-ml-console.html
npm run release      # build, then publish the single file as a GitHub release asset
```

- **Serve over `http://localhost`.** An `https://` origin would block requests
  to the phone's `http://` address as mixed content. `localhost` is also a
  secure context, so `getUserMedia` (mic capture, encoded to WAV in-browser)
  works.
- **Panels.** One panel per capability, wired in `src/panels/registry.ts`.
  `PanelDef.capabilityId` is optional — non-capability panels (e.g. the API
  Reference) omit it. Panels grey out when the phone reports the capability
  unavailable, showing the phone's reason.
- **Live camera.** The Faces and Pose panels share
  `src/components/LiveCameraView.tsx`: webcam → JPEG frame → the existing
  one-shot vision endpoints, exactly one request in flight (drop-while-busy),
  newest detections drawn over the `<video>` preview via `drawLiveOverlay`
  in `src/utils/overlay.ts`. There is no dedicated streaming endpoint, so
  the 5-way API-docs sync is not in play for it.
- **Camera capture.** Every `ImageDropzone` offers "take a photo" via
  `src/components/CameraCapture.tsx`. Camera plumbing (stream lifecycle,
  device picker, secure-context error) is shared with live mode through
  `src/utils/useCamera.ts`, and both auto-stop when their panel hides via
  `src/utils/useCloseWhenHidden.ts`. Photos are captured unmirrored even when
  the preview is mirrored (mirrored stills would break OCR text and hand
  chirality).
- **Single-file console.** `npm run build` also emits a self-contained
  `dist/sidecar-ml-console.html` (CSS, JS, favicon, and the mic worklet all
  inlined — the worklet via `?raw` + a Blob URL so it runs from `file://`).
  This file is **not committed**; distribution is the GitHub release asset
  only. The iOS app links the stable
  `releases/latest/download/sidecar-ml-console.html` URL, so after a console
  change lands on `main`, run `npm run release` to replace the asset.
- The phone's CORS policy is `*`, which accepts the `null` origin a
  `file://`-opened console sends.

## API docs stay in 5-way sync

When the server gains/changes an endpoint, update all five in lockstep:

1. `docs/API.md` + the per-area pages in `docs/api/`
2. the in-app API Reference — `webapp/webapp/src/docs/apiReference.ts` +
   `ApiDocsPanel.tsx`
3. the Python client — `examples/python/.../client.py` (one wrapper per route)
4. a matching `demo.py` command
5. the FastAPI proxy — `fastapi_proxy.py` (same `/v1` paths)

`src/test/ApiDocsPanel.test.tsx` hardcodes the route list and fails if
`apiReference.ts` drifts — a useful tripwire.

## Python examples (`examples/python/`)

- Python **3.10+**; code uses modern `X | None` unions (don't reintroduce
  `Optional[X]`). Venv convention: create `.venv` inside `examples/python/`
  (gitignored).
- CLI via **typer** (env vars `SIDECAR_URL` / `SIDECAR_TOKEN`), logging via
  **loguru** (data → stdout, logs → stderr; silence with
  `logger.disable("client")`). `python-multipart` is required for the proxy's
  upload routes.

## Conventions

- **Branding is settled: "Sidecar ML" is final** — don't rebrand.
- Wire identifiers are frozen regardless of display naming: endpoint paths and
  the `sidecar.*` localStorage keys.
- **Security:** the phone is open on the LAN by default; enable the bearer
  token in the app and the console/examples all accept one. Everything is
  on-device except Shazam catalog matching, which calls Apple.
