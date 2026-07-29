import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED = path.join(here, '../fixtures/generated');
export const HUMAN = process.env.SIDECAR_E2E_MEDIA_DIR || path.join(here, '../fixtures/human');

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.heic': 'image/heic',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.aiff': 'audio/aiff',
  '.caf': 'audio/x-caf',
  '.flac': 'audio/flac',
};

/**
 * Always resolves an explicit mimeType. The phone cannot decode WebM/Opus or
 * Ogg, and letting the type be inferred is the most common fixture failure.
 */
function load(fullPath: string): UploadFile {
  const extension = path.extname(fullPath).toLowerCase();
  const mimeType = MIME[extension];
  if (!mimeType) throw new Error(`no known mime type for ${fullPath}`);
  return { name: path.basename(fullPath), mimeType, buffer: readFileSync(fullPath) };
}

export function generated(name: string): UploadFile {
  const full = path.join(GENERATED, name);
  if (!existsSync(full)) {
    throw new Error(`missing generated fixture ${name} — run: npm run e2e:fixtures`);
  }
  return load(full);
}

/** Human-supplied media, or null when the user did not provide it. */
export function human(name: string): UploadFile | null {
  const override = name === 'music.m4a' ? process.env.SIDECAR_E2E_SONG : undefined;
  const full = override || path.join(HUMAN, name);
  return existsSync(full) ? load(full) : null;
}

/**
 * A real photo when supplied, otherwise the generated stand-in. `isReal` tells
 * the spec whether it may assert semantics or only that the round trip worked.
 */
export function photoOrGenerated(
  humanName: string,
  generatedName: string,
): { file: UploadFile; isReal: boolean } {
  const real = human(humanName);
  return real ? { file: real, isReal: true } : { file: generated(generatedName), isReal: false };
}

/** Blob built in-page from a Buffer, for panels fed from an earlier response. */
export function toUpload(name: string, mimeType: string, buffer: Buffer): UploadFile {
  return { name, mimeType, buffer };
}
