# Human-supplied fixtures (optional)

Most fixtures are generated at run time — see `../build-fixtures.mjs`. A few
things genuinely cannot be synthesised, so the panels that need them **skip
cleanly** unless you drop a file here.

Nothing in this directory is committed (`.gitignore` keeps only this README).
This is a public repo: never commit photos of people, and never commit music.

## What to add

| File | Upgrades | Without it |
|---|---|---|
| `person.jpg` | Faces, Pose (body), Person Mask, Remove Background, Classify, and the fake webcam used by the live-camera tests | those panels run against generated images and assert only that the round trip works (reported as `PASS*`), or skip |
| `hand.jpg` | Pose (hand joints) | skipped |
| `document.jpg` | Document Scan — a real photo of a page at an angle detects far more reliably than the generated one | falls back to the generated `document-skew.jpg` |
| `music.m4a` | Song ID — a ~15 s clip of a commercially released track | Song ID runs against speech and expects `No match found.` |

Guidance: longest edge ≥ 800 px so the phone's detectors have something to work
with, JPEG or PNG, and for `person.jpg` a single clearly-lit person facing the
camera with head and torso in frame.

## Pointing somewhere else

```bash
SIDECAR_E2E_MEDIA_DIR=~/sidecar-fixtures npm run e2e
SIDECAR_E2E_SONG=~/Music/clip.m4a npm run e2e   # overrides music.m4a specifically
```

## Why these are not generated

Faces, bodies and hands need real anatomy — Apple's Vision detectors will not
fire on drawn shapes, and a test that asserts "0 faces found" in a generated
image proves the request/response plumbing but not the feature. Music has to be
a real commercial recording for the Shazam catalogue to match it at all.
