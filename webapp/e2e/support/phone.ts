import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Capability, Probe } from './preflight.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const PHONE_JSON = path.join(here, '../.artifacts/phone.json');

let cached: Probe | null = null;

function load(): Probe {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(PHONE_JSON, 'utf8')) as Probe;
  } catch {
    // Playwright builds the test tree before globalSetup runs, and `--list`
    // never runs it at all. Degrade to an empty probe so importing a spec can
    // never throw; anything that actually needs the data runs later, by which
    // point globalSetup has written the file.
    cached = {
      baseUrl: process.env.SIDECAR_URL ?? '',
      token: process.env.SIDECAR_TOKEN ?? '',
      health: { app: 'unknown', status: 'unknown', uptime_s: 0, version: '0' },
      capabilities: [],
      translationPairs: {},
      transcribeLocales: { installed: [], supported: [] },
      imageStyles: null,
      voices: [],
      reachedAt: 'not probed',
    };
  }
  return cached;
}

/**
 * The probe global-setup wrote. Lazily read on first property access, so
 * importing a spec never depends on the file existing yet.
 */
export const phone: Probe = new Proxy({} as Probe, {
  get: (_target, property) => load()[property as keyof Probe],
  has: (_target, property) => property in load(),
  ownKeys: () => Reflect.ownKeys(load()),
  getOwnPropertyDescriptor: (_target, property) => ({
    value: load()[property as keyof Probe],
    enumerable: true,
    configurable: true,
  }),
});

export function capability(id: string): Capability | undefined {
  return phone.capabilities.find((c) => c.id === id);
}

/**
 * Mirrors webapp/src/panels/registry.ts. Three capability ids back more than
 * one panel (vision-subjects, vision-analysis, vision-detectors), so gating is
 * done per panel — an unavailable capability must produce one skip row per
 * affected panel, not a single collapsed one.
 */
export const PANEL_CAPABILITY: Record<string, string | null> = {
  Chat: 'chat',
  Translate: 'translation',
  'Text Analysis': 'nlp',
  OCR: 'vision-ocr',
  'Remove Background': 'vision-subjects',
  'Person Mask': 'vision-subjects',
  'Barcodes & QR': 'vision-analysis',
  Classify: 'vision-analysis',
  'Image Similarity': 'vision-analysis',
  Faces: 'vision-detectors',
  Pose: 'vision-detectors',
  'Document Scan': 'vision-detectors',
  'Face Changer': 'face-fx',
  'Voice Changer': 'voice-fx',
  'Generate Image': 'image-gen',
  Transcribe: 'speech-transcribe',
  Speak: 'speech-speak',
  'Sound Events': 'sound',
  'Song ID': 'shazam',
  'API Reference': null,
};

/**
 * Reason string for skipping a panel, or null when the phone says it is ready.
 * Always quotes the phone's own `reason` so the report explains itself.
 */
export function unavailableReason(panelTitle: string): string | null {
  const id = PANEL_CAPABILITY[panelTitle];
  if (!id) return null;
  const cap = capability(id);
  if (!cap) return `phone did not report capability "${id}"`;
  if (!cap.available) return `phone reports ${id} unavailable: ${cap.reason ?? 'no reason given'}`;
  return null;
}

/** Extra per-panel preconditions that the capability flag alone does not cover. */
export function extraPrecondition(panelTitle: string): string | null {
  switch (panelTitle) {
    case 'Translate': {
      const status = phone.translationPairs['en>de'];
      return status === 'installed'
        ? null
        : `en->de pair_status=${status ?? 'unknown'} — download the pair in the app (Settings -> Translation)`;
    }
    case 'Transcribe': {
      const installed = phone.transcribeLocales.installed;
      return installed.some((l) => l.toLowerCase().startsWith('en'))
        ? null
        : `no en-* transcription model installed (installed: ${installed.join(', ') || 'none'})`;
    }
    case 'Generate Image':
      return phone.imageStyles === null
        ? 'GET /v1/images/styles answered 503 — Apple Intelligence gated, or the app is backgrounded'
        : null;
    case 'Speak':
      return phone.voices.length > 0 ? null : 'phone reports no installed voices';
    default:
      return null;
  }
}

/** Combined gate: capability flag first, then the panel-specific precondition. */
export function skipReason(panelTitle: string): string | null {
  return unavailableReason(panelTitle) ?? extraPrecondition(panelTitle);
}
