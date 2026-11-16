import type { Rect, Sprite } from '@/shared/types';
import { armorize, drawProceduralArmor } from './armor';

const MAX_DIM = 1400; // CSS px; larger elements are rendered at reduced resolution

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const scale = Math.min(dpr, MAX_DIM / Math.max(w, h, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

function isTransparent(color: string): boolean {
  return !color || color === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(color);
}

/** The background colour the user actually sees behind an element. */
function effectiveBackground(el: Element): string {
  let node: Element | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (!isTransparent(bg)) return bg;
    node = node.parentElement;
  }
  return '#ffffff';
}

export function visibleText(el: Element, max = 160): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface TextStyle {
  font: string;
  lineHeight: number;
  color: string;
  background: string;
  align: 'left' | 'center' | 'right';
  paddingLeft: number;
  paddingRight: number;
}

function drawTextCard(w: number, h: number, text: string, style: TextStyle): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, w, h);
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'middle';
  const innerW = Math.max(10, w - style.paddingLeft - style.paddingRight);
  let lines = wrapLines(ctx, text, innerW);
  const maxLines = Math.max(1, Math.floor(h / style.lineHeight + 0.25));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] += '…';
  }
  const blockH = lines.length * style.lineHeight;
  let y = (h - blockH) / 2 + style.lineHeight / 2;
  ctx.textAlign = style.align;
  const x =
    style.align === 'center'
      ? style.paddingLeft + innerW / 2
      : style.align === 'right'
        ? w - style.paddingRight
        : style.paddingLeft;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += style.lineHeight;
  }
  return canvas;
}

function snapshotText(el: Element, rect: Rect): Sprite {
  const cs = getComputedStyle(el);
  const fontSize = parseFloat(cs.fontSize) || 16;
  const lh = parseFloat(cs.lineHeight);
  const text = visibleText(el);
  const a = cs.textAlign;
  const align = a === 'center' ? 'center' : a === 'right' || a === 'end' ? 'right' : 'left';
  const canvas = drawTextCard(rect.w, rect.h, text, {
    font: `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`,
    lineHeight: Number.isFinite(lh) ? lh : fontSize * 1.2,
    color: cs.color,
    background: effectiveBackground(el),
    align,
    paddingLeft: parseFloat(cs.paddingLeft) || 0,
    paddingRight: parseFloat(cs.paddingRight) || 0,
  });
  return { canvas, w: rect.w, h: rect.h, text };
}

/** Media we could not draw at all (not loaded, decode error, DRM). */
function drawFallbackBlock(ctx: CanvasRenderingContext2D, w: number, h: number, label: string): void {
  drawProceduralArmor(ctx, w, h, label);
}

/** Destination rect inside (0,0,w,h) honouring object-fit cover/contain. */
export function fitRect(srcW: number, srcH: number, w: number, h: number, fit: string): [number, number, number, number] {
  if (fit !== 'cover' && fit !== 'contain') return [0, 0, w, h];
  const s = fit === 'cover' ? Math.max(w / srcW, h / srcH) : Math.min(w / srcW, h / srcH);
  const dw = srcW * s;
  const dh = srcH * s;
  return [(w - dw) / 2, (h - dh) / 2, dw, dh];
}

/** Video default is `contain` (letterboxed), unlike images which stretch. */
function videoFit(fit: string): string {
  return fit === 'fill' || fit === 'cover' ? fit : 'contain';
}

/**
 * Draws the current video frame into a sprite. Cross-origin video taints the
 * canvas but still draws; DRM-protected video draws black (nothing we can do).
 * Returns false when no frame is available yet.
 */
export function drawVideoFrame(sprite: Sprite): boolean {
  const v = sprite.live;
  if (!v || v.readyState < 2 || v.videoWidth === 0) return false;
  const ctx = sprite.canvas.getContext('2d')!;
  try {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, sprite.w, sprite.h);
    ctx.drawImage(v, ...fitRect(v.videoWidth, v.videoHeight, sprite.w, sprite.h, videoFit(sprite.fit ?? '')));
    // First real frame decides whether this video is cross-origin.
    if (sprite.tainted === undefined) armorize(sprite, sprite.text);
    else if (sprite.armor) ctx.drawImage(sprite.armor, 0, 0, sprite.w, sprite.h);
    return true;
  } catch {
    return false;
  }
}

function snapshotMedia(el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement, rect: Rect): Sprite {
  const { canvas, ctx } = makeCanvas(rect.w, rect.h);
  const fit = getComputedStyle(el).objectFit;
  let drawn = false;
  const sprite: Sprite = { canvas, w: rect.w, h: rect.h, text: 'IMG' };
  try {
    if (el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0) {
      // Cross-origin images taint the canvas, but drawing them still works:
      // we only ever display the sprite, never read its pixels back.
      ctx.drawImage(el, ...fitRect(el.naturalWidth, el.naturalHeight, rect.w, rect.h, fit));
      drawn = true;
      sprite.text = el.alt.trim() || 'IMG';
    } else if (el instanceof HTMLVideoElement) {
      sprite.live = el;
      sprite.fit = fit;
      sprite.text = el.getAttribute('aria-label') || el.title || 'VIDEO';
      drawn = drawVideoFrame(sprite);
      if (!drawn && el.poster) {
        // No decoded frame yet: fall back to the poster (YouTube/TikTok thumbnails).
        const poster = document.querySelector<HTMLImageElement>(`img[src="${CSS.escape(el.poster)}"]`);
        if (poster?.complete) {
          ctx.drawImage(poster, ...fitRect(poster.naturalWidth, poster.naturalHeight, rect.w, rect.h, 'cover'));
          drawn = true;
        }
      }
    } else if (el instanceof HTMLCanvasElement && el.width > 0 && el.height > 0) {
      ctx.drawImage(el, 0, 0, rect.w, rect.h);
      drawn = true;
      sprite.text = 'CANVAS';
    }
  } catch {
    drawn = false;
  }
  if (!drawn) drawFallbackBlock(ctx, rect.w, rect.h, `<${el.tagName.toLowerCase()}> ${sprite.text}`);
  else if (!sprite.live) armorize(sprite, sprite.text);
  return sprite;
}

/** CSS background-image elements (X/Twitter media, many card grids). */
export function snapshotBackground(el: Element, rect: Rect, img: HTMLImageElement): Sprite {
  const { canvas, ctx } = makeCanvas(rect.w, rect.h);
  const cs = getComputedStyle(el);
  const size = cs.backgroundSize;
  const fit = size.includes('cover') ? 'cover' : size.includes('contain') ? 'contain' : 'cover';
  const label = (el.getAttribute('aria-label') || '').trim() || 'IMG';
  const sprite: Sprite = { canvas, w: rect.w, h: rect.h, text: label };
  try {
    ctx.fillStyle = effectiveBackground(el);
    ctx.fillRect(0, 0, rect.w, rect.h);
    ctx.drawImage(img, ...fitRect(img.naturalWidth, img.naturalHeight, rect.w, rect.h, fit));
    armorize(sprite, label);
  } catch {
    drawFallbackBlock(ctx, rect.w, rect.h, label);
  }
  return sprite;
}

/**
 * Embedded players (YouTube/TikTok/Instagram embeds) are cross-origin frames
 * we cannot see into, so they become a "blocked content" card.
 */
export function snapshotFrame(el: Element, rect: Rect): Sprite {
  const { canvas, ctx } = makeCanvas(rect.w, rect.h);
  const isFrame = el instanceof HTMLIFrameElement;
  let host = isFrame ? 'embed' : 'ad slot';
  try {
    if (isFrame && el.src) host = new URL(el.src, location.href).hostname.replace(/^www\./, '') || 'embed';
  } catch {
    /* srcdoc / about:blank */
  }
  ctx.fillStyle = '#16161b';
  ctx.fillRect(0, 0, rect.w, rect.h);
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  for (let x = -rect.h; x < rect.w; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, rect.h);
    ctx.lineTo(x + rect.h, 0);
    ctx.stroke();
  }
  const s = Math.min(rect.w, rect.h);
  const r = Math.max(14, s * 0.16);
  ctx.fillStyle = '#ff3131';
  ctx.beginPath();
  ctx.roundRect(rect.w / 2 - r * 1.4, rect.h / 2 - r, r * 2.8, r * 2, r * 0.5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(rect.w / 2 - r * 0.4, rect.h / 2 - r * 0.55);
  ctx.lineTo(rect.w / 2 + r * 0.6, rect.h / 2);
  ctx.lineTo(rect.w / 2 - r * 0.4, rect.h / 2 + r * 0.55);
  ctx.fill();
  ctx.font = `700 ${Math.max(10, Math.min(14, s * 0.08))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b8b8c2';
  ctx.fillText(`<${el.tagName.toLowerCase()}> ${host}`, rect.w / 2, Math.min(rect.h - 10, rect.h / 2 + r + 20));
  return { canvas, w: rect.w, h: rect.h, text: host };
}

export function snapshotElement(el: Element, rect: Rect): Sprite {
  if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLCanvasElement) {
    return snapshotMedia(el, rect);
  }
  if (el instanceof HTMLIFrameElement) return snapshotFrame(el, rect);
  return snapshotText(el, rect);
}

/** Loads (usually from cache) an image URL; resolves null on error or timeout. */
export function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.referrerPolicy = 'no-referrer-when-downgrade';
    img.src = url;
  });
}

/** A synthetic "page fragment" for filler enemies on sparse pages. */
export function makeTextSprite(text: string, w: number, h: number, color: string, background: string): Sprite {
  const fontSize = Math.round(h * 0.5);
  const canvas = drawTextCard(w, h, text, {
    font: `700 ${fontSize}px ui-monospace, Consolas, monospace`,
    lineHeight: h,
    color,
    background,
    align: 'center',
    paddingLeft: 6,
    paddingRight: 6,
  });
  return { canvas, w, h, text };
}
