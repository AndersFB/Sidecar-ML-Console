# E2E smoke test runbook — console vs. a real iPhone

Execute this top to bottom. It drives the web console in a real browser against
a real iPhone running the Sidecar ML app, then reports what the device could and
could not do.

**You are the operator.** Follow the decision rules literally — several
"failures" in this system are documented, correct behaviour, and reporting them
as bugs is wrong. Equally, never report a SKIP as a PASS.

---

## 0. What you need

| | |
|---|---|
| An iPhone | Sidecar ML installed, server started, app in the **foreground** |
| Same network | Phone and this computer on the same Wi-Fi (or USB — see §9) |
| Node | 18+ (`node -v`) |
| This repo | commands below run from `webapp/`, not the repo root |

Everything runs on `http://localhost:5173`. Never serve the console over
`https://` — the page would block plain-HTTP requests to the phone as mixed
content, and the suite would fail for a reason that has nothing to do with the
console.

---

## 1. Phone checklist

Confirm all five before you start. Most "the console is broken" reports are one
of these.

1. Sidecar ML is **open and in the foreground**. iOS suspends network servers
   when the app is backgrounded or the phone locks. Turn off auto-lock, or use
   the app's keep-awake toggle.
2. Server started — the app's Connect card shows an address like
   `http://192.168.1.20:8080`.
3. Phone and computer on the **same Wi-Fi**. An address on `pdp_ip0` (cellular)
   is not reachable from this computer.
4. On the phone: Settings → Privacy & Security → **Local Network** → Sidecar ML
   is ON.
5. For the translation test, the **en→de pair is downloaded** in the app
   (Settings → Translation). For transcription, an **en-US model** is installed.
   Neither is required — the suite skips cleanly — but they widen coverage.

Find the address without reading it off the phone:

```bash
dns-sd -B _sidecarml._tcp        # macOS
avahi-browse -rt _sidecarml._tcp # Linux
```

---

## 2. Install

```bash
cd webapp
npm install
npx playwright install chromium    # skip if PLAYWRIGHT_BROWSERS_PATH is preset
```

If Chromium is already provided by the environment (a container image with
`PLAYWRIGHT_BROWSERS_PATH` set) do **not** download a second copy. Point the
suite at the existing binary instead:

```bash
export SIDECAR_E2E_CHROMIUM=/opt/pw-browsers/chromium
```

---

## 3. Preflight — do this before anything else

```bash
export SIDECAR_URL=http://192.168.1.20:8080   # the phone's Connect card
npm run e2e:preflight
```

Expected: a summary naming the phone, `N/12 available`, and a reason for every
unavailable capability.

**If this fails, stop.** A red preflight is a phone or network problem, never a
console problem. Work the §1 checklist, then the §11 table. Do not run the
suite to "see what happens" — you will get 20 timeouts that tell you nothing.

`SIDECAR_URL` must be the phone's address. `http://127.0.0.1:8080` is *this
computer* and is rejected unless you are deliberately tunnelling over USB
(§9), in which case set `SIDECAR_E2E_ALLOW_LOOPBACK=1`.

---

## 4. Fixtures

Generated automatically at the start of every run; no binaries are committed.

- **Images** — Chromium renders `fixtures/generator.html` and screenshots it:
  an OCR text card, a Code 39 barcode, a similarity pair, a skewed document
  page, a subject on a plain background.
- **Audio** — the **phone speaks it**. `POST /v1/speech/speak` produces a real
  WAV that the Transcribe test feeds back in, so speech is tested as a genuine
  round trip rather than a canned blob.

To rebuild by hand: `npm run e2e:fixtures`.

### Optional: real media widens coverage

Faces, bodies, hands and music **cannot be synthesised** — Apple's detectors do
not fire on drawn shapes, and Shazam needs a real recording. Those tests still
run and verify the round trip, but they are reported as **PASS\*** rather than
PASS, or skipped.

Drop files into `webapp/e2e/fixtures/human/` to upgrade them to real assertions:
`person.jpg`, `hand.jpg`, `document.jpg`, `music.m4a`. See that directory's
README. Nothing there is committed — this is a public repo.

---

## 5. Run

```bash
cd webapp
SIDECAR_URL=http://192.168.1.20:8080 npm run e2e
```

Useful variants:

```bash
npm run e2e -- --project=chromium 20-vision-text   # one spec
npm run e2e -- --project=chromium-fakemedia        # live camera only
npm run e2e -- --headed                            # watch it
npm run e2e:report                                 # the markdown table to report
```

The suite runs **single-worker on purpose**. The phone runs 2 concurrent vision
requests and 1 each for chat, speech, sound, Shazam and image generation, and
queues the rest server-side. Parallel workers would not go faster; they would
just blow client timeouts and produce failures that look like console bugs.

---

## 6. Decision rules

Apply these literally when reading results.

| Outcome | Meaning | What to do |
|---|---|---|
| **PASS** | Asserted semantically — the phone returned the right answer. | Nothing. |
| **PASS\*** | Round trip verified; the fixture could not prove the feature. | Report as PASS\*, say why. Do not call it a full pass. |
| **SKIP** | The device cannot do this. | Report it **with the phone's own reason**, quoted. |
| **FAIL** | A real defect. | Open the trace before reporting (§10). |

Hard rules:

- **Never report a SKIP as a PASS.** Every skip row must carry the phone's
  `reason`, `pair_status`, or the missing-fixture message.
- A panel with no human fixture is SKIP or PASS\*, never FAIL.
- The run exits non-zero only for FAIL. Skips do not fail the run.

---

## 7. Documented outcomes that are **not** failures

This is the section that most often gets misread. All of these are correct
behaviour:

| What you see | Why | Verdict |
|---|---|---|
| Song ID → `No match found.` | `{"matched": false}` is a normal 200. Speech will never match the catalogue. | PASS\* |
| Document Scan → `No document found in this image.` | `{"detected": false}` at 200 is content-dependent, not an error. | PASS\* |
| Remove Background → `400 bad_request` with a **generated** fixture | `/v1/vision/subject-mask` is the one route that answers 4xx when the image has no foreground subject. | SKIP |
| Remove Background → `400 bad_request` with a **real photo** | Now it is a genuine defect. | **FAIL** |
| Faces / Pose → `0 face(s)` with a generated fixture | Vision detectors need real anatomy. | PASS\* |
| Classify → `Nothing confidently recognized.` | A valid 200 for abstract art. | PASS\* |
| OCR on a blank image → empty text | Valid 200. | n/a |
| `503 capability_unavailable` mid-run | The device lost a capability — commonly the app was backgrounded. | SKIP, and re-check §1 |
| `429 busy` | The on-device model self-rate-limited. The suite retries automatically. | transient |

---

## 8. Coverage

All 18 panels, each gated on what `GET /v1/capabilities` reported. Three
capability ids back more than one panel (`vision-subjects`, `vision-analysis`,
`vision-detectors`), so one unavailable capability produces several skip rows —
that is intentional, gating is per panel.

| Spec | Covers |
|---|---|
| `00-connection` | auto-connect, phone identity, capability dots, wrong address → Offline + banner → recovery, unavailable-capability banner |
| `10-chat` | SSE streaming, non-streaming, clear, state surviving a panel switch |
| `15-language` | Translate (en→de), Text Analysis |
| `20-vision-text` | OCR (asserts the exact text round-trips), Barcodes (asserts the Code 39 payload), Clear |
| `25-vision-analysis` | Classify, Image Similarity (asserts a near-duplicate scores closer than an unrelated image) |
| `30-vision-subjects` | Remove Background, Person Mask |
| `35-vision-detectors` | Faces, Pose (body + hand), Document Scan |
| `40-live-camera` | Faces and Pose live loops via a fake camera — capture → POST → overlay → fps |
| `50-audio` | Speak, Transcribe (**speak → transcribe round trip**), Sound Events, Song ID |
| `60-image-gen` | Generate Image |
| `70-api-docs` | Base URL substitution, endpoint filter, the 30-route count |
| `80-persistence` | Reload restores the selected panel (localStorage) and the image + result (IndexedDB) |
| `85-singlefile` | The released single-file console over `file://` |
| `90-auth-token` | Bearer token, and the wrong-token asymmetry |

---

## 9. Extra surfaces

**Bearer token.** Off by default. Enable it in the app's Settings tab, then:

```bash
SIDECAR_TOKEN=<token from the app> npm run e2e -- 90-auth-token
```

Worth knowing: `GET /` and `GET /health` are the only routes that never require
the token. So a *wrong* token can leave the console showing a green **Online**
badge while every capability call fails with 401. The spec accepts either branch
and records which one happened.

**Single-file console** — the artifact the iOS app links to:

```bash
npm run build
npm run e2e -- --project=singlefile
```

It is opened from `file://`, so the address is typed into the UI rather than
seeded (localStorage is unreliable there). The page's origin is `null`, which
the phone's `*` CORS policy accepts.

**Live camera** — needs no webcam; Chromium is fed a generated video file:

```bash
npm run e2e -- --project=chromium-fakemedia
```

**USB, no Wi-Fi.** Either use Personal Hotspot over USB
(`SIDECAR_URL=http://172.20.10.1:8080`) or `iproxy 8080:8080` and then
`SIDECAR_URL=http://127.0.0.1:8080 SIDECAR_E2E_ALLOW_LOOPBACK=1`. See the repo
README.

---

## 10. Report

```bash
npm run e2e:report
```

Paste that table as your result. It looks like this:

```
## Sidecar ML Console — E2E smoke
Phone: Sidecar ML 1.4.2 @ http://192.168.1.20:8080 (up 4213s)
Capabilities: 10/12 available — unavailable: shazam, image-gen

Result: 19 pass · 3 pass* · 4 skip · 1 fail

| Area | Test | Status | Detail | Time |
|---|---|---|---|---|
| Translate | translates English to German | SKIP | en->de pair_status=supported — download the pair in the app | – |
| Song ID | matches a song, or honestly reports no match | PASS* | no music clip supplied — "No match found." is the expected 200 | 3.1s |
```

Before reporting any **FAIL**, open its trace and say what actually broke:

```bash
npx playwright show-trace e2e/.artifacts/test-results/<test>/trace.zip
npx playwright show-report e2e/.artifacts/html
```

Note in your summary: which capabilities the phone lacked, whether human
fixtures were supplied, and whether the token and single-file legs ran.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Preflight cannot reach the phone | app backgrounded, wrong network, Local Network permission off | §1 checklist |
| Everything fails right after `Online` | Chrome's Local/Private Network Access gate | already handled by launch flags; confirm the console works manually at `http://localhost:5173` |
| `Executable doesn't exist` | installed Playwright expects a different Chromium build | `npx playwright install chromium`, or set `SIDECAR_E2E_CHROMIUM` |
| `webServer` timed out | something else holds port 5173 — Vite silently moves to 5174 | free the port (`lsof -ti:5173 \| xargs kill`) |
| `strict mode violation: resolved to N elements` | a locator was not scoped to the visible panel | panels stay mounted-but-hidden; scope via `activePanel()` |
| Panel state lost after reload | reloaded inside the 250 ms persistence debounce | use `settlePersistence()` / `waitForIdbKey()` |
| Transcribe returns `(silence)` | audio was not WAV, or no locale model installed | fixtures must be WAV/M4A/MP3/AIFF/CAF/FLAC — **WebM/Opus and Ogg cannot be decoded**; check `/v1/speech/transcribe/locales` |
| Image generation 503s mid-run | app went to the background or the phone locked | foreground the app, disable auto-lock |
| `npm run test:run` tries to run e2e specs | the Vitest `exclude` in `vite.config.ts` was removed | restore `exclude: [...configDefaults.exclude, 'e2e/**']` |

---

## 12. How it fits together

```
global-setup.ts     probe the phone -> .artifacts/phone.json, build fixtures
  support/preflight   /health, /v1/capabilities, translation pairs, locales, voices, styles
  support/phone       per-panel gating; every skip quotes the phone's own reason
  support/console     activePanel scoping, openPanel, file inputs, IndexedDB, retry policy
  support/test        fresh context per test + seeded connection (auto-connects on mount)
  support/media       generated vs human fixtures
specs/*.spec.ts     the tests, ordered by filename prefix
report.mjs          results.json + phone.json -> the markdown table
```

Two details worth knowing if you change the suite:

- **Storage lives in two places.** `localStorage` (address, token, selected
  panel, text inputs) *and* IndexedDB `sidecar-console`/`kv` (images, audio,
  results). Each test gets a fresh browser context, which is the only reliable
  reset for both.
- **`Online` is a one-shot claim.** The console probes `/health` and
  `/v1/capabilities` once on mount and once per Connect press — there is no
  polling. A phone that backgrounds mid-run keeps a green badge while every
  request fails. If results turn bad partway through, re-run the preflight.
