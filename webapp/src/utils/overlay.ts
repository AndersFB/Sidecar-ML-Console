import type { Box, Joint, Point } from '../api/types';

const STROKE = '#22d3ee';
const FILL = 'rgba(34, 211, 238, 0.12)';

/** Draws the source image and labeled boxes onto a canvas (pixel space). */
export function drawImageWithBoxes(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  boxes: { box: Box; label?: string }[],
): void {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(image, 0, 0);
  const scale = Math.max(1, image.naturalWidth / 600);
  ctx.lineWidth = 2 * scale;
  ctx.font = `${12 * scale}px ui-monospace, monospace`;

  for (const { box, label } of boxes) {
    ctx.strokeStyle = STROKE;
    ctx.fillStyle = FILL;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    if (label) {
      const text = label.length > 40 ? `${label.slice(0, 40)}…` : label;
      const metrics = ctx.measureText(text);
      const pad = 4 * scale;
      const y = Math.max(box.y - 16 * scale, 0);
      ctx.fillStyle = 'rgba(11, 16, 32, 0.85)';
      ctx.fillRect(box.x, y, metrics.width + pad * 2, 16 * scale);
      ctx.fillStyle = STROKE;
      ctx.fillText(text, box.x + pad, y + 12 * scale);
    }
  }
}

export function drawImageWithPoints(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  pointGroups: Point[][],
): void {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(image, 0, 0);
  const radius = Math.max(2, image.naturalWidth / 300);
  for (const points of pointGroups) {
    ctx.fillStyle = STROKE;
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
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

export function drawSkeletons(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  persons: { joints: Record<string, Joint> }[],
): void {
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(image, 0, 0);
  const scale = Math.max(1, image.naturalWidth / 600);

  for (const person of persons) {
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 2 * scale;
    for (const [from, to] of BODY_EDGES) {
      const a = person.joints[from];
      const b = person.joints[to];
      if (a && b && a.confidence > 0.2 && b.confidence > 0.2) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#4f46e5';
    for (const joint of Object.values(person.joints)) {
      if (joint.confidence > 0.2) {
        ctx.beginPath();
        ctx.arc(joint.x, joint.y, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
