import { HttpResponse, http } from 'msw';
import type {
  BodyPoseResponse,
  Capability,
  FacesResponse,
  HandPoseResponse,
  Health,
  OcrResponse,
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

export const handlers = [
  http.get(`${BASE}/health`, () => HttpResponse.json(healthFixture)),
  http.get(`${BASE}/v1/capabilities`, () => HttpResponse.json(capabilitiesFixture)),
  http.post(`${BASE}/v1/vision/ocr`, () => HttpResponse.json(ocrFixture)),
  http.post(`${BASE}/v1/vision/faces`, () => HttpResponse.json(facesFixture)),
  http.post(`${BASE}/v1/vision/body-pose`, () => HttpResponse.json(bodyPoseFixture)),
  http.post(`${BASE}/v1/vision/hand-pose`, () => HttpResponse.json(handPoseFixture)),
  http.get(`${BASE}/v1/images/styles`, () => HttpResponse.json({ styles: [] })),
  http.get(`${BASE}/v1/speech/voices`, () => HttpResponse.json({ voices: [] })),
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
