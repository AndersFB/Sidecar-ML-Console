import { HttpResponse, http } from 'msw';
import type { Capability, Health, OcrResponse } from '../../api/types';

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

export const handlers = [
  http.get(`${BASE}/health`, () => HttpResponse.json(healthFixture)),
  http.get(`${BASE}/v1/capabilities`, () => HttpResponse.json(capabilitiesFixture)),
  http.post(`${BASE}/v1/vision/ocr`, () => HttpResponse.json(ocrFixture)),
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
