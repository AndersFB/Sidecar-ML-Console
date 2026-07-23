import { vi } from 'vitest';

/** The single video track handed to camera components; assert on `stop`. */
export const cameraTrack = { stop: vi.fn() };

const fakeStream = {
  getTracks: () => [cameraTrack],
  getVideoTracks: () => [cameraTrack],
} as unknown as MediaStream;

function ctxStub(): CanvasRenderingContext2D {
  return {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 10 }),
  } as unknown as CanvasRenderingContext2D;
}

/**
 * jsdom has no camera, no <video> playback, and no 2D canvas — stub the
 * pieces the camera components touch so they run end-to-end against MSW.
 * Pair with removeCameraStubs() (plus vi.restoreAllMocks()) in afterEach.
 */
export function installCameraStubs(): void {
  cameraTrack.stop.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    configurable: true,
    get: () => 480,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
    configurable: true,
    get: () => 4,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctxStub());
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    writable: true,
    value(callback: BlobCallback) {
      callback(new Blob(['frame'], { type: 'image/jpeg' }));
    },
  });
}

export function removeCameraStubs(): void {
  Reflect.deleteProperty(navigator, 'mediaDevices');
  Reflect.deleteProperty(HTMLMediaElement.prototype, 'srcObject');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoWidth');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'videoHeight');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'readyState');
  Reflect.deleteProperty(HTMLCanvasElement.prototype, 'toBlob');
}
