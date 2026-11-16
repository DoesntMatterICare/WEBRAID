import type { Sprite } from '@/shared/types';

/**
 * Cross-origin ("CORS-tainted") media: the browser lets us draw it but never
 * read it back. Those enemies become scanline ARMOR cards — tougher, and
 * visibly marked as content from another origin.
 *
 * - 'overlay'    (default) the real image stays visible under scanlines and
 *                armor plates. On real sites almost every CDN thumbnail is
 *                cross-origin, so this keeps YouTube/Instagram thumbnails
 *                recognisable.
 * - 'procedural' the image is replaced entirely by a generated armor card.
 */
export const ARMOR_MODE: 'overlay' | 'procedural' = 'overlay';

/** Extra hit points an armored (cross-origin) enemy gets. */
export const ARMOR_HP = 3;

/** True if the canvas holds cross-origin pixels (reading them throws). */
export function isTainted(canvas: HTMLCanvasElement): boolean {
  try {
    canvas.getContext('2d')!.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}

function plates(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = Math.max(8, Math.min(22, Math.min(w, h) * 0.22));
  ctx.fillStyle = 'rgba(13,13,16,.82)';
  const tri = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.fill();
  };
  tri(0, 0, s, 0, 0, s);
  tri(w, 0, w - s, 0, w, s);
  tri(0, h, s, h, 0, h - s);
  tri(w, h, w - s, h, w, h - s);
  ctx.fillStyle = '#c9c7bf';
  const r = Math.max(1.2, s * 0.09);
  for (const [x, y] of [[s * 0.28, s * 0.28], [w - s * 0.28, s * 0.28], [s * 0.28, h - s * 0.28], [w - s * 0.28, h - s * 0.28]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function scanlines(ctx: CanvasRenderingContext2D, w: number, h: number, alpha: number): void {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

function tag(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
  if (w < 46 || h < 22) return;
  ctx.font = '800 9px ui-monospace, Consolas, monospace';
  const tw = ctx.measureText(text).width + 8;
  ctx.fillStyle = '#ffe14d';
  ctx.fillRect(w - tw - 4, h - 16, tw, 12);
  ctx.fillStyle = '#0d0d10';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w - tw, h - 9.5);
}

/** Transparent layer composited over the real (cross-origin) pixels. */
function makeOverlay(sprite: Sprite): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = sprite.canvas.width;
  c.height = sprite.canvas.height;
  const ctx = c.getContext('2d')!;
  ctx.scale(c.width / sprite.w, c.height / sprite.h);
  scanlines(ctx, sprite.w, sprite.h, 0.22);
  plates(ctx, sprite.w, sprite.h);
  tag(ctx, sprite.w, sprite.h, 'CORS');
  return c;
}

/** Fully generated armor card (also used when media cannot be drawn at all). */
export function drawProceduralArmor(ctx: CanvasRenderingContext2D, w: number, h: number, label: string): void {
  ctx.fillStyle = '#26252b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1;
  for (let x = -h; x < w; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  scanlines(ctx, w, h, 0.35);
  plates(ctx, w, h);
  if (w >= 60 && h >= 34) {
    ctx.font = `700 ${Math.max(9, Math.min(13, h * 0.16))}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#b8b8c2';
    ctx.fillText(label.slice(0, 24), w / 2, h / 2);
    ctx.textAlign = 'left';
  }
  tag(ctx, w, h, 'ARMOR');
}

/**
 * Call after media has been drawn into `sprite.canvas`. Marks the sprite as
 * tainted and applies the armor treatment. Safe to call more than once.
 */
export function armorize(sprite: Sprite, label: string): void {
  if (sprite.tainted !== undefined) return;
  sprite.tainted = isTainted(sprite.canvas);
  if (!sprite.tainted) return;
  const ctx = sprite.canvas.getContext('2d')!;
  if (ARMOR_MODE === 'procedural') {
    delete sprite.live; // nothing to stream into a generated card
    drawProceduralArmor(ctx, sprite.w, sprite.h, label);
    return;
  }
  sprite.armor = makeOverlay(sprite);
  ctx.drawImage(sprite.armor, 0, 0, sprite.w, sprite.h);
}
