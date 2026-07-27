import { HttpResponse, http } from 'msw';
import {
  DEFAULT_FACE_PARAMETERS,
  DEFAULT_VOICE_PARAMETERS,
  type BodyPoseResponse,
  type Capability,
  type FacePresetsResponse,
  type FacesResponse,
  type FaceSwapResponse,
  type FaceTransformResponse,
  type HandPoseResponse,
  type Health,
  type OcrResponse,
  type VoiceMatchResponse,
  type VoicePresetsResponse,
} from '../../api/types';

export const BASE = 'http://phone.test:8080';

export const healthFixture: Health = {
  status: 'ok',
  app: 'Sidecar ML',
  version: '1.0',
  uptime_s: 12.5,
};

export const capabilitiesFixture: Capability[] = [
  {
    id: 'chat',
    name: 'Chat (On-Device LLM)',
    category: 'language',
    summary: 'On-device LLM',
    requires_network: false,
    available: true,
    endpoints: ['POST /v1/chat/completions'],
  },
  {
    id: 'vision-ocr',
    name: 'Text Recognition (OCR)',
    category: 'vision',
    summary: 'OCR',
    requires_network: false,
    available: true,
    endpoints: ['POST /v1/vision/ocr'],
  },
  {
    id: 'image-gen',
    name: 'Image Generation',
    category: 'vision',
    summary: 'Image Playground',
    requires_network: false,
    available: false,
    reason: 'Needs Apple Intelligence.',
    endpoints: ['POST /v1/images/generations'],
  },
  {
    id: 'voice-fx',
    name: 'Voice Changer',
    category: 'speech',
    summary: 'Voice effects',
    requires_network: false,
    available: true,
    endpoints: ['POST /v1/voice/transform'],
  },
  {
    id: 'face-fx',
    name: 'Face Changer',
    category: 'vision',
    summary: 'Face effects',
    requires_network: false,
    available: true,
    endpoints: ['POST /v1/face/transform'],
  },
];

export const ocrFixture: OcrResponse = {
  image: { width: 800, height: 240 },
  text: 'HELLO SIDECAR',
  lines: [
    {
      text: 'HELLO SIDECAR',
      confidence: 0.97,
      box_px: { x: 40, y: 80, width: 500, height: 60 },
    },
  ],
};

export const facesFixture: FacesResponse = {
  image: { width: 800, height: 600 },
  faces: [
    {
      box_px: { x: 120, y: 90, width: 200, height: 240 },
      roll_deg: 10,
      yaw_deg: -4.1,
      pitch_deg: 0.9,
      landmarks: {
        left_eye: [
          { x: 170, y: 180 },
          { x: 185, y: 178 },
        ],
        right_eye: [
          { x: 250, y: 180 },
          { x: 265, y: 178 },
        ],
      },
    },
  ],
};

export const bodyPoseFixture: BodyPoseResponse = {
  image: { width: 640, height: 480 },
  persons: [
    {
      joints: {
        left_shoulder: { x: 220, y: 180, confidence: 0.95 },
        right_shoulder: { x: 420, y: 180, confidence: 0.93 },
        left_hip: { x: 240, y: 340, confidence: 0.9 },
        right_hip: { x: 400, y: 340, confidence: 0.88 },
      },
    },
  ],
};

export const handPoseFixture: HandPoseResponse = {
  image: { width: 640, height: 480 },
  hands: [
    {
      chirality: 'right',
      joints: {
        VNHLKWRI: { x: 300, y: 400, confidence: 0.97 },
        VNHLKTTIP: { x: 340, y: 300, confidence: 0.8 },
      },
    },
  ],
};

/** 1×1 transparent PNG — enough for the envelope decode path. */
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk' +
  'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
/** 44-byte WAV header, no samples. */
export const WAV_BASE64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export const voicePresetsFixture: VoicePresetsResponse = {
  presets: [
    { id: 'none', name: 'None', parameters: DEFAULT_VOICE_PARAMETERS },
    {
      id: 'giant',
      name: 'Giant',
      parameters: { ...DEFAULT_VOICE_PARAMETERS, pitch_cents: -800, rate: 0.9 },
    },
  ],
  distortion_presets: ['multiDecimated1', 'speechRadioTower'],
  reverb_presets: ['smallRoom', 'largeRoom'],
};

export const facePresetsFixture: FacePresetsResponse = {
  presets: [
    { id: 'none', name: 'None', parameters: DEFAULT_FACE_PARAMETERS },
    {
      id: 'cartoon',
      name: 'Cartoon',
      parameters: { ...DEFAULT_FACE_PARAMETERS, eye_size: 0.75, style: 'comic' },
    },
  ],
  styles: ['none', 'comic', 'pixellate'],
  directions: ['source_into_target', 'target_into_source'],
};

export const faceTransformFixture: FaceTransformResponse = {
  image: { width: 1, height: 1 },
  faces: 1,
  result: { content_type: 'image/png', data_base64: PNG_BASE64, width: 1, height: 1 },
};

export const faceSwapFixture: FaceSwapResponse = {
  image: { width: 1, height: 1 },
  result: { content_type: 'image/png', data_base64: PNG_BASE64, width: 1, height: 1 },
  notes: [
    'Landmark-aligned composite: existing pixels are warped and blended onto the destination face. This is not a generative face swap and synthesizes no new identity.',
    'Best results come from similar head pose, framing and lighting in both photos.',
  ],
};

export const voiceMatchFixture: VoiceMatchResponse = {
  source: {
    median_f0_hz: 118.4,
    f0_low_hz: 96.2,
    f0_high_hz: 151,
    spectral_centroid_hz: 1840.5,
    voiced_ratio: 0.62,
    duration_s: 4.1,
    sample_rate: 44100,
  },
  target: {
    median_f0_hz: 210.7,
    f0_low_hz: 180.1,
    f0_high_hz: 260.4,
    spectral_centroid_hz: 2400.2,
    voiced_ratio: 0.71,
    duration_s: 3.8,
    sample_rate: 44100,
  },
  parameters: { ...DEFAULT_VOICE_PARAMETERS, pitch_cents: 380, brightness: 0.22 },
};

export const handlers = [
  http.get(`${BASE}/health`, () => HttpResponse.json(healthFixture)),
  http.get(`${BASE}/v1/capabilities`, () => HttpResponse.json(capabilitiesFixture)),
  http.post(`${BASE}/v1/vision/ocr`, () => HttpResponse.json(ocrFixture)),
  http.post(`${BASE}/v1/vision/faces`, () => HttpResponse.json(facesFixture)),
  http.post(`${BASE}/v1/vision/body-pose`, () => HttpResponse.json(bodyPoseFixture)),
  http.post(`${BASE}/v1/vision/hand-pose`, () => HttpResponse.json(handPoseFixture)),
  http.get(`${BASE}/v1/images/styles`, () => HttpResponse.json({ styles: [] })),
  http.get(`${BASE}/v1/speech/voices`, () => HttpResponse.json({ voices: [] })),
  http.get(`${BASE}/v1/voice/presets`, () => HttpResponse.json(voicePresetsFixture)),
  http.post(`${BASE}/v1/voice/transform`, () =>
    HttpResponse.json({
      content_type: 'audio/wav',
      data_base64: WAV_BASE64,
      duration_s: 1.5,
      sample_rate: 44100,
    }),
  ),
  http.post(`${BASE}/v1/voice/analyze`, () => HttpResponse.json(voiceMatchFixture.source)),
  http.post(`${BASE}/v1/voice/match`, () => HttpResponse.json(voiceMatchFixture)),
  http.post(`${BASE}/v1/voice/respeak`, () =>
    HttpResponse.json({
      content_type: 'audio/wav',
      data_base64: WAV_BASE64,
      duration_s: 2.9,
      sample_rate: 22050,
      text: 'hello from the phone',
    }),
  ),
  http.get(`${BASE}/v1/face/presets`, () => HttpResponse.json(facePresetsFixture)),
  http.post(`${BASE}/v1/face/transform`, () => HttpResponse.json(faceTransformFixture)),
  http.post(`${BASE}/v1/face/swap`, () => HttpResponse.json(faceSwapFixture)),
  http.post(`${BASE}/v1/chat/completions`, () =>
    HttpResponse.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1,
      model: 'apple-fm',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Pong from the phone!' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7, estimated: true },
    }),
  ),
];
