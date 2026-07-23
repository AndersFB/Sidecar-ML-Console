import type {
  AudioEnvelope,
  BarcodesResponse,
  BodyPoseResponse,
  Capability,
  ChatCompletionResponse,
  ChatMessage,
  ClassifyResponse,
  DocumentResponse,
  FacesResponse,
  HandPoseResponse,
  Health,
  ImageEnvelope,
  ImageGenerationResponse,
  NlpAnalyzeResponse,
  NlpSimilarityResponse,
  OcrResponse,
  ShazamResponse,
  SimilarityResponse,
  SoundClassifyResponse,
  TranscribeLocales,
  TranscribeResponse,
  TranslateResponse,
  TranslationLanguages,
  Voice,
} from './types';
import { base64ToBlob, blobToBase64 } from '../utils/base64';
import { log } from '../utils/log';

export interface ApiConfig {
  baseUrl: string;
  token?: string;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function headers(config: ApiConfig, extra: Record<string, string> = {}): Record<string, string> {
  const result: Record<string, string> = { ...extra };
  if (config.token) result.Authorization = `Bearer ${config.token}`;
  return result;
}

async function parseError(response: Response): Promise<never> {
  let code = 'http_error';
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    // non-JSON error body
  }
  log.warn(`server error ${response.status} [${code}]: ${message}`);
  throw new ApiError(response.status, code, message);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PENDING_HINT_MS = 5000;

/** All API calls funnel through here so every request/response/failure is logged. */
export async function request(
  config: ApiConfig,
  path: string,
  init: RequestInit,
  detail = '',
): Promise<Response> {
  const url = joinUrl(config.baseUrl, path);
  const method = init.method ?? 'GET';
  const label = `${method} ${url}${detail ? ` (${detail})` : ''}`;
  const started = performance.now();
  log.info(`→ ${label}`);
  const pendingHint = setTimeout(() => {
    log.warn(
      `⏳ ${label} still pending after ${PENDING_HINT_MS / 1000}s — usually the address is wrong or the phone is unreachable (different network, app in background, phone asleep).`,
    );
  }, PENDING_HINT_MS);
  try {
    const response = await fetch(url, init);
    const ms = Math.round(performance.now() - started);
    const line = `← ${response.status} ${method} ${path} (${ms}ms)`;
    if (response.ok) log.info(line);
    else log.warn(line);
    return response;
  } catch (error) {
    const ms = Math.round(performance.now() - started);
    log.error(`✕ ${method} ${url} failed after ${ms}ms:`, error);
    throw error;
  } finally {
    clearTimeout(pendingHint);
  }
}

async function getJson<T>(config: ApiConfig, path: string): Promise<T> {
  const response = await request(config, path, { headers: headers(config) });
  if (!response.ok) await parseError(response);
  return response.json();
}

async function postJson<T>(config: ApiConfig, path: string, body: unknown): Promise<T> {
  const response = await request(config, path, {
    method: 'POST',
    headers: headers(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

async function postBinary<T>(
  config: ApiConfig,
  path: string,
  blob: Blob,
  signal?: AbortSignal,
): Promise<T> {
  const response = await request(
    config,
    path,
    {
      method: 'POST',
      headers: headers(config, {
        'Content-Type': blob.type || 'application/octet-stream',
      }),
      body: blob,
      signal,
    },
    formatBytes(blob.size),
  );
  if (!response.ok) await parseError(response);
  return response.json();
}

export function envelopeToDataUrl(envelope: ImageEnvelope): string {
  return `data:${envelope.content_type};base64,${envelope.data_base64}`;
}

/** Decode once to a Blob so the base64 string can be garbage-collected. */
export function envelopeToBlob(envelope: ImageEnvelope): Blob {
  return base64ToBlob(envelope.data_base64, envelope.content_type);
}

export function audioEnvelopeToBlob(envelope: AudioEnvelope): Blob {
  return base64ToBlob(envelope.data_base64, envelope.content_type);
}

// MARK: Endpoints

export const api = {
  health: (c: ApiConfig) => getJson<Health>(c, '/health'),
  capabilities: (c: ApiConfig) => getJson<Capability[]>(c, '/v1/capabilities'),

  ocr: (c: ApiConfig, image: Blob, params = '') =>
    postBinary<OcrResponse>(c, `/v1/vision/ocr${params}`, image),
  barcodes: (c: ApiConfig, image: Blob) =>
    postBinary<BarcodesResponse>(c, '/v1/vision/barcodes', image),
  classify: (c: ApiConfig, image: Blob, topK = 10) =>
    postBinary<ClassifyResponse>(c, `/v1/vision/classify?top_k=${topK}`, image),
  similarity: async (c: ApiConfig, imageA: Blob, imageB: Blob) =>
    postJson<SimilarityResponse>(c, '/v1/vision/similarity', {
      image_a_base64: await blobToBase64(imageA),
      image_b_base64: await blobToBase64(imageB),
    }),
  subjectMask: (c: ApiConfig, image: Blob, mode: 'cutout' | 'mask') =>
    postBinary<ImageEnvelope>(c, `/v1/vision/subject-mask?mode=${mode}`, image),
  personSegmentation: (c: ApiConfig, image: Blob, quality: string) =>
    postBinary<ImageEnvelope>(c, `/v1/vision/person-segmentation?quality=${quality}`, image),
  // The optional signal lets the live camera loop abort a frame that hangs
  // (e.g. the phone went to sleep mid-request) instead of stalling forever.
  faces: (c: ApiConfig, image: Blob, signal?: AbortSignal) =>
    postBinary<FacesResponse>(c, '/v1/vision/faces', image, signal),
  bodyPose: (c: ApiConfig, image: Blob, signal?: AbortSignal) =>
    postBinary<BodyPoseResponse>(c, '/v1/vision/body-pose', image, signal),
  handPose: (c: ApiConfig, image: Blob, signal?: AbortSignal) =>
    postBinary<HandPoseResponse>(c, '/v1/vision/hand-pose', image, signal),
  document: (c: ApiConfig, image: Blob, format: 'png' | 'jpeg' = 'png') =>
    postBinary<DocumentResponse>(c, `/v1/vision/document?correct=true&format=${format}`, image),

  nlpAnalyze: (c: ApiConfig, text: string, features?: string[]) =>
    postJson<NlpAnalyzeResponse>(c, '/v1/nlp/analyze', { text, features }),
  nlpSimilarity: (c: ApiConfig, textA: string, textB: string) =>
    postJson<NlpSimilarityResponse>(c, '/v1/nlp/similarity', {
      text_a: textA,
      text_b: textB,
    }),

  voices: (c: ApiConfig) => getJson<{ voices: Voice[] }>(c, '/v1/speech/voices'),
  speak: (c: ApiConfig, text: string, voice?: string, rate?: number) =>
    postJson<AudioEnvelope>(c, '/v1/speech/speak', { text, voice, rate }),
  transcribeLocales: (c: ApiConfig) =>
    getJson<TranscribeLocales>(c, '/v1/speech/transcribe/locales'),
  transcribe: (c: ApiConfig, audio: Blob, locale?: string) =>
    postBinary<TranscribeResponse>(
      c,
      `/v1/speech/transcribe${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`,
      audio,
    ),

  translationLanguages: (c: ApiConfig) =>
    getJson<TranslationLanguages>(c, '/v1/translation/languages'),
  translate: (c: ApiConfig, texts: string[], source: string | undefined, target: string) =>
    postJson<TranslateResponse>(c, '/v1/translation/translate', {
      texts,
      source,
      target,
    }),

  soundClassify: (c: ApiConfig, audio: Blob, window = 1.5) =>
    postBinary<SoundClassifyResponse>(c, `/v1/sound/classify?window=${window}`, audio),
  shazam: (c: ApiConfig, audio: Blob) =>
    postBinary<ShazamResponse>(c, '/v1/shazam/match', audio),

  chat: (c: ApiConfig, messages: ChatMessage[], maxTokens?: number) =>
    postJson<ChatCompletionResponse>(c, '/v1/chat/completions', {
      messages,
      max_tokens: maxTokens,
    }),

  imageStyles: (c: ApiConfig) => getJson<{ styles: string[] }>(c, '/v1/images/styles'),
  imageGenerate: (c: ApiConfig, prompt: string, n: number, style?: string) =>
    postJson<ImageGenerationResponse>(c, '/v1/images/generations', { prompt, n, style }),
};
