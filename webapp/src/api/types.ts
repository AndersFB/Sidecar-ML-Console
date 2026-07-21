// DTOs mirroring the ML Sidecar server (snake_case as sent over the wire).

export interface Capability {
  id: string;
  name: string;
  category: string;
  summary: string;
  requires_network: boolean;
  available: boolean;
  reason?: string;
  endpoints: string[];
}

export interface Health {
  status: string;
  app: string;
  version: string;
  uptime_s: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface OcrLine {
  text: string;
  confidence: number;
  box_px: Box;
}

export interface OcrResponse {
  image: ImageSize;
  text: string;
  lines: OcrLine[];
}

export interface Barcode {
  payload: string | null;
  symbology: string;
  box_px: Box;
}

export interface BarcodesResponse {
  image: ImageSize;
  barcodes: Barcode[];
}

export interface Classification {
  label: string;
  confidence: number;
}

export interface ClassifyResponse {
  image: ImageSize;
  classifications: Classification[];
}

export interface SimilarityResponse {
  distance: number;
  similarity_hint: string;
}

export interface ImageEnvelope {
  content_type: string;
  data_base64: string;
  width: number;
  height: number;
}

export interface Joint {
  x: number;
  y: number;
  confidence: number;
}

export interface Face {
  box_px: Box;
  roll_deg?: number;
  yaw_deg?: number;
  pitch_deg?: number;
  landmarks: Record<string, Point[]>;
}

export interface FacesResponse {
  image: ImageSize;
  faces: Face[];
}

export interface BodyPoseResponse {
  image: ImageSize;
  persons: { joints: Record<string, Joint> }[];
}

export interface HandPoseResponse {
  image: ImageSize;
  hands: { chirality?: string; joints: Record<string, Joint> }[];
}

export interface DocumentResponse {
  image: ImageSize;
  detected: boolean;
  quad_px?: Point[];
  confidence?: number;
  corrected?: ImageEnvelope;
}

export interface NlpEntity {
  text: string;
  type: string;
  start: number;
  end: number;
}

export interface NlpAnalyzeResponse {
  language?: string;
  language_hypotheses?: { language: string; confidence: number }[];
  sentiment?: number;
  entities?: NlpEntity[];
  tokens?: { text: string; lemma?: string; pos?: string }[];
}

export interface NlpSimilarityResponse {
  distance: number;
  cosine?: number;
}

export interface Voice {
  identifier: string;
  name: string;
  language: string;
  quality: string;
  is_personal: boolean;
  is_novelty: boolean;
}

export interface AudioEnvelope {
  content_type: string;
  data_base64: string;
  duration_s: number;
  sample_rate: number;
}

export interface TranscriptSegment {
  text: string;
  start_s: number;
  end_s: number;
}

export interface TranscribeResponse {
  text: string;
  locale: string;
  segments: TranscriptSegment[];
}

export interface TranscribeLocales {
  supported: string[];
  installed: string[];
}

export interface TranslationResult {
  text: string;
  detected_source?: string;
}

export interface TranslateResponse {
  translations: TranslationResult[];
}

export interface TranslationLanguages {
  languages: string[];
  pair_status?: 'installed' | 'supported' | 'unsupported';
}

export interface SoundWindow {
  start_s: number;
  end_s: number;
  classifications: Classification[];
}

export interface SoundClassifyResponse {
  duration_s: number;
  windows: SoundWindow[];
  top: Classification[];
}

export interface ShazamResponse {
  matched: boolean;
  media?: {
    title?: string;
    artist?: string;
    album?: string;
    apple_music_url?: string;
    artwork_url?: string;
    offset_s?: number;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: { message: { role: string; content: string }; finish_reason?: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface ChatChunk {
  choices: { delta: { role?: string; content?: string }; finish_reason?: string }[];
}

export interface ImageGenerationResponse {
  created: number;
  data: { b64_json: string }[];
}

export interface ApiErrorEnvelope {
  error: { code: string; message: string; type: string };
}
