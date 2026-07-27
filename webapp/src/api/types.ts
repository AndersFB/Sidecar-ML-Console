// DTOs mirroring the Sidecar ML server (snake_case as sent over the wire).

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

// MARK: Voice FX

/**
 * Voice changer settings. Mirrors the server's `VoiceParameters`, which clamps
 * every field on decode — `VOICE_LIMITS` below repeats those bounds so the
 * sliders and the server's clamp cannot disagree.
 */
export interface VoiceParameters {
  pitch_cents: number;
  rate: number;
  brightness: number;
  throat: number;
  distortion: number;
  distortion_preset?: string | null;
  reverb: number;
  reverb_preset?: string | null;
  gain_db: number;
}

export const VOICE_LIMITS = {
  pitch_cents: { min: -2400, max: 2400, step: 10 },
  rate: { min: 0.5, max: 2, step: 0.01 },
  brightness: { min: -1, max: 1, step: 0.01 },
  throat: { min: -1, max: 1, step: 0.01 },
  distortion: { min: 0, max: 1, step: 0.01 },
  reverb: { min: 0, max: 1, step: 0.01 },
  gain_db: { min: -12, max: 12, step: 0.1 },
} as const;

export const DEFAULT_VOICE_PARAMETERS: VoiceParameters = {
  pitch_cents: 0,
  rate: 1,
  brightness: 0,
  throat: 0,
  distortion: 0,
  reverb: 0,
  gain_db: 0,
};

export interface VoicePreset {
  id: string;
  name: string;
  parameters: VoiceParameters;
}

export interface VoicePresetsResponse {
  presets: VoicePreset[];
  distortion_presets: string[];
  reverb_presets: string[];
}

export interface VoiceProfile {
  median_f0_hz?: number | null;
  f0_low_hz?: number | null;
  f0_high_hz?: number | null;
  spectral_centroid_hz: number;
  /** Below 0.1 the F0 estimate is not trustworthy. */
  voiced_ratio: number;
  duration_s: number;
  sample_rate: number;
}

export interface VoiceMatchResponse {
  source: VoiceProfile;
  target: VoiceProfile;
  parameters: VoiceParameters;
  audio?: AudioEnvelope;
}

export interface VoiceRespeakResponse extends AudioEnvelope {
  text: string;
}

// MARK: Face FX

/** Mirrors the server's `FaceParameters`; every geometry control is signed and
 * centred on 0, so 0 is always identity. */
export interface FaceParameters {
  eye_size: number;
  nose_width: number;
  mouth_size: number;
  chin_length: number;
  face_width: number;
  swirl: number;
  smoothing: number;
  warmth: number;
  brightness: number;
  saturation: number;
  style?: string | null;
  style_amount: number;
  /** Composites the effects back through a face-shaped mask, leaving the
   * background untouched — the difference between a face filter and a
   * whole-image filter. */
  mask_to_face: boolean;
  mask_feather: number;
  mask_expand: number;
}

export const FACE_LIMITS = {
  signed: { min: -1, max: 1, step: 0.01 },
  unit: { min: 0, max: 1, step: 0.01 },
  mask_expand: { min: -0.3, max: 0.6, step: 0.01 },
} as const;

export const DEFAULT_FACE_PARAMETERS: FaceParameters = {
  eye_size: 0,
  nose_width: 0,
  mouth_size: 0,
  chin_length: 0,
  face_width: 0,
  swirl: 0,
  smoothing: 0,
  warmth: 0,
  brightness: 0,
  saturation: 0,
  style_amount: 1,
  mask_to_face: true,
  mask_feather: 0.5,
  mask_expand: 0.08,
};

export interface FaceSwapParameters {
  direction: string;
  blend: number;
  feather: number;
  color_match: number;
  scale: number;
  offset_x: number;
  offset_y: number;
  face?: FaceParameters | null;
}

export const FACE_SWAP_LIMITS = {
  unit: { min: 0, max: 1, step: 0.01 },
  scale: { min: 0.8, max: 1.2, step: 0.005 },
  offset: { min: -0.3, max: 0.3, step: 0.005 },
} as const;

export const DEFAULT_FACE_SWAP_PARAMETERS: FaceSwapParameters = {
  direction: 'source_into_target',
  blend: 0.9,
  feather: 0.5,
  color_match: 0.8,
  scale: 1,
  offset_x: 0,
  offset_y: 0,
};

export interface FacePreset {
  id: string;
  name: string;
  parameters: FaceParameters;
}

export interface FacePresetsResponse {
  presets: FacePreset[];
  styles: string[];
  directions: string[];
}

export interface FaceTransformResponse {
  image: ImageSize;
  /** Zero means the image came back untouched rather than the call failing. */
  faces: number;
  result: ImageEnvelope;
}

export interface FaceSwapResponse {
  image: ImageSize;
  result: ImageEnvelope;
  /** What the caller should know about the technique's limits. */
  notes: string[];
}

export interface ApiErrorEnvelope {
  error: { code: string; message: string; type: string };
}
