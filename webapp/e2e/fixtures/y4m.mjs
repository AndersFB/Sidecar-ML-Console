/**
 * Writes a YUV4MPEG2 (I420) file for Chromium's
 * --use-file-for-fake-video-capture. Chromium loops the file, so a handful of
 * identical frames is enough to drive the console's live-camera loop.
 *
 * Dimensions must be even (4:2:0 chroma subsampling).
 */

function clamp8(value) {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

/** @param rgba Uint8ClampedArray|Buffer of width*height*4 bytes */
export function rgbaToY4m(rgba, width, height, { frames = 10, fps = 15 } = {}) {
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error(`Y4M needs even dimensions, got ${width}x${height}`);
  }

  const ySize = width * height;
  const chromaWidth = width / 2;
  const chromaHeight = height / 2;
  const chromaSize = chromaWidth * chromaHeight;

  const y = Buffer.alloc(ySize);
  const u = Buffer.alloc(chromaSize);
  const v = Buffer.alloc(chromaSize);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      // BT.601 studio-swing, which is what Chromium assumes for I420.
      y[row * width + col] = clamp8(0.257 * r + 0.504 * g + 0.098 * b + 16);
    }
  }

  // Average each 2x2 block for the chroma planes.
  for (let row = 0; row < chromaHeight; row++) {
    for (let col = 0; col < chromaWidth; col++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((row * 2 + dy) * width + (col * 2 + dx)) * 4;
          sumR += rgba[i];
          sumG += rgba[i + 1];
          sumB += rgba[i + 2];
        }
      }
      const r = sumR / 4;
      const g = sumG / 4;
      const b = sumB / 4;
      u[row * chromaWidth + col] = clamp8(-0.148 * r - 0.291 * g + 0.439 * b + 128);
      v[row * chromaWidth + col] = clamp8(0.439 * r - 0.368 * g - 0.071 * b + 128);
    }
  }

  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420mpeg2\n`, 'ascii');
  const frameHeader = Buffer.from('FRAME\n', 'ascii');
  const parts = [header];
  for (let i = 0; i < frames; i++) parts.push(frameHeader, y, u, v);
  return Buffer.concat(parts);
}
