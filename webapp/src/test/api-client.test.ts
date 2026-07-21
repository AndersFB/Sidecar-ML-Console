import { describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { ApiError, api, joinUrl } from '../api/client';
import { BASE } from './msw/handlers';
import { server } from './msw/server';

describe('joinUrl', () => {
  it('joins base and path cleanly', () => {
    expect(joinUrl('http://x:8080', '/health')).toBe('http://x:8080/health');
    expect(joinUrl('http://x:8080/', '/health')).toBe('http://x:8080/health');
    expect(joinUrl('http://x:8080//', 'health')).toBe('http://x:8080/health');
  });
});

describe('api client', () => {
  it('fetches health', async () => {
    const health = await api.health({ baseUrl: BASE });
    expect(health.app).toBe('Sidecar ML');
    expect(health.uptime_s).toBeCloseTo(12.5);
  });

  it('sends the bearer token when configured', async () => {
    let received: string | null = null;
    server.use(
      http.get(`${BASE}/health`, ({ request }) => {
        received = request.headers.get('Authorization');
        return HttpResponse.json({ status: 'ok', app: 'x', version: '1', uptime_s: 0 });
      }),
    );
    await api.health({ baseUrl: BASE, token: 'secret-token' });
    expect(received).toBe('Bearer secret-token');
  });

  it('maps the error envelope to ApiError', async () => {
    server.use(
      http.post(`${BASE}/v1/vision/ocr`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'capability_unavailable',
              message: 'Not on this device.',
              type: 'service_unavailable_error',
            },
          },
          { status: 503 },
        ),
      ),
    );
    const attempt = api.ocr({ baseUrl: BASE }, new Blob(['x'], { type: 'image/png' }));
    await expect(attempt).rejects.toThrowError(ApiError);
    await expect(
      api.ocr({ baseUrl: BASE }, new Blob(['x'], { type: 'image/png' })),
    ).rejects.toMatchObject({
      status: 503,
      code: 'capability_unavailable',
      message: 'Not on this device.',
    });
  });

  it('posts binary bodies with the blob content type', async () => {
    let contentType: string | null = null;
    server.use(
      http.post(`${BASE}/v1/vision/ocr`, ({ request }) => {
        contentType = request.headers.get('Content-Type');
        return HttpResponse.json({ image: { width: 1, height: 1 }, text: '', lines: [] });
      }),
    );
    await api.ocr({ baseUrl: BASE }, new Blob(['png-bytes'], { type: 'image/png' }));
    expect(contentType).toBe('image/png');
  });
});
