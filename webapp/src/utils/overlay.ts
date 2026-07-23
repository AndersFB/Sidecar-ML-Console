import type { Box, Face, ImageSize, Joint, Point } from '../api/types';

const STROKE = '#22d3ee';
const FILL = 'rgba(34, 211, 238, 0.12)';

/**
 * Longest canvas edge. Panels render results at ≤768 CSS px, but visited
 * panels stay mounted while hidden, and a canvas sized to a 12 MP photo pins
 * ~46 MB of bitmap for the page's lifetime. ~2x the display width keeps
 * retina sharpness at a bounded (~7 MB) cost; server pixel coordinates are
 * scaled to match.
 */
const MAX_CANVAS_EDGE = 1600;

function prepareCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
): { ctx: CanvasRenderingContext2D; s: number } | null {
  const longEdge = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const s = Math.min(1, MAX_CANVAS_EDGE / longEdge);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * s));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { ctx, s };
}

function paintBoxes(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  s: number,
  boxes: { box: Box; label?: string }[],
): void {
  const scale = Math.max(1, canvasWidth / 600);
  ctx.lineWidth = 2 * scale;
  ctx.font = `${12 * scale}px ui-monospace, monospace`;

  for (const { box, label } of boxes) {
    ctx.strokeStyle = STROKE;
    ctx.fillStyle = FILL;
    ctx.fillRect(box.x * s, box.y * s, box.width * s, box.height * s);
    ctx.strokeRect(box.x * s, box.y * s, box.width * s, box.height * s);
    if (label) {
      const text = label.length > 40 ? `${label.slice(0, 40)}…` : label;
      const metrics = ctx.measureText(text);
      const pad = 4 * scale;
      const y = Math.max(box.y * s - 16 * scale, 0);
      ctx.fillStyle = 'rgba(11, 16, 32, 0.85)';
      ctx.fillRect(box.x * s, y, metrics.width + pad * 2, 16 * scale);
      ctx.fillStyle = STROKE;
      ctx.fillText(text, box.x * s + pad, y + 12 * scale);
    }
  }
}

function paintPoints(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  s: number,
  pointGroups: Point[][],
): void {
  const radius = Math.max(2, canvasWidth / 300);
  for (const points of pointGroups) {
    ctx.fillStyle = STROKE;
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x * s, point.y * s, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const BODY_EDGES: [string, string][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

function paintSkeletons(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  s: number,
  persons: { joints: Record<string, Joint> }[],
): void {
  const scale = Math.max(1, canvasWidth / 600);

  for (const person of persons) {
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 2 * scale;
    for (const [from, to] of BODY_EDGES) {
      const a = person.joints[from];
      const b = person.joints[to];
      if (a && b && a.confidence > 0.2 && b.confidence > 0.2) {
        ctx.beginPath();
        ctx.moveTo(a.x * s, a.y * s);
        ctx.lineTo(b.x * s, b.y * s);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#4f46e5';
    for (const joint of Object.values(person.joints)) {
      if (joint.confidence > 0.2) {
        ctx.beginPath();
        ctx.arc(joint.x * s, joint.y * s, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Draws the source image and labeled boxes onto a canvas (pixel space). */
export function drawImageWithBoxes(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  boxes: { box: Box; label?: string }[],
): void {
  const prepared = prepareCanvas(canvas, image);
  if (!prepared) return;
  paintBoxes(prepared.ctx, canvas.width, prepared.s, boxes);
}

export function drawImageWithPoints(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  pointGroups: Point[][],
): void {
  const prepared = prepareCanvas(canvas, image);
  if (!prepared) return;
  paintPoints(prepared.ctx, canvas.width, prepared.s, pointGroups);
}

export function drawSkeletons(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  persons: { joints: Record<string, Joint> }[],
): void {
  const prepared = prepareCanvas(canvas, image);
  if (!prepared) return;
  paintSkeletons(prepared.ctx, canvas.width, prepared.s, persons);
}

// MARK: Live camera

export type LiveMode = 'faces' | 'body' | 'hands';

/** Latest detections from the phone, in the pixel space of the frame sent. */
export interface LiveDetections {
  mode: LiveMode;
  /** Size the server analyzed — the dimensions of the frame that was posted. */
  frame: ImageSize;
  faces?: Face[];
  persons?: { joints: Record<string, Joint> }[];
  hands?: { chirality?: string; joints: Record<string, Joint> }[];
}

/**
 * Draws detections onto a transparent canvas layered over the live `<video>`
 * preview. The canvas backing store is sized to the analyzed frame, so server
 * pixel coordinates apply 1:1 and CSS scales the layer with the video.
 */
export function drawLiveOverlay(canvas: HTMLCanvasElement, detections: LiveDetections): void {
  const { width, height } = detections.frame;
  if (canvas.width !== width) canvas.width = Math.max(1, width);
  if (canvas.height !== height) canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (detections.mode === 'faces' && detections.faces) {
    paintBoxes(ctx, canvas.width, 1, detections.faces.map((face) => ({ box: face.box_px })));
    paintPoints(ctx, canvas.width, 1, detections.faces.flatMap((face) => Object.values(face.landmarks)));
  } else if (detections.mode === 'body' && detections.persons) {
    paintSkeletons(ctx, canvas.width, 1, detections.persons);
  } else if (detections.mode === 'hands' && detections.hands) {
    paintPoints(ctx, canvas.width, 1, detections.hands.map((hand) => Object.values(hand.joints)));
  }
}
