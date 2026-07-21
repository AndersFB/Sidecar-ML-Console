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
import { blobToBase64 } from '../utils/base64';

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
  throw new ApiError(response.status, code, message);
}

async function getJson<T>(config: ApiConfig, path: string): Promise<T> {
  const response = await fetch(joinUrl(config.baseUrl, path), {
    headers: headers(config),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

async function postJson<T>(config: ApiConfig, path: string, body: unknown): Promise<T> {
  const response = await fetch(joinUrl(config.baseUrl, path), {
    method: 'POST',
    headers: headers(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

async function postBinary<T>(config: ApiConfig, path: string, blob: Blob): Promise<T> {
  const response = await fetch(joinUrl(config.baseUrl, path), {
    method: 'POST',
    headers: headers(config, {
      'Content-Type': blob.type || 'application/octet-stream',
    }),
    body: blob,
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

export function envelopeToDataUrl(envelope: ImageEnvelope): string {
  return `data:${envelope.content_type};base64,${envelope.data_base64}`;
}

export function audioEnvelopeToDataUrl(envelope: AudioEnvelope): string {
  return `data:${envelope.content_type};base64,${envelope.data_base64}`;
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
  faces: (c: ApiConfig, image: Blob) =>
    postBinary<FacesResponse>(c, '/v1/vision/faces', image),
  bodyPose: (c: ApiConfig, image: Blob) =>
    postBinary<BodyPoseResponse>(c, '/v1/vision/body-pose', image),
  handPose: (c: ApiConfig, image: Blob) =>
    postBinary<HandPoseResponse>(c, '/v1/vision/hand-pose', image),
  document: (c: ApiConfig, image: Blob) =>
    postBinary<DocumentResponse>(c, '/v1/vision/document?correct=true', image),

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
