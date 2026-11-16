import type { Rect, Sprite } from '@/shared/types';
import { armorize, drawProceduralArmor } from './armor';
import { loadImage, makeTextSprite, snapshotElement } from './snapshot';

/**
 * Finds the site's logo — the final boss. Priority (PROJECT.md §2):
 *  1. <img> in <header> / [class*=logo] / [id*=logo] / [aria-label*=logo]
 *  2. <svg> in a link to "/" (usually inside the header)
 *  3. og:site_name + favicon, rendered as a synthetic boss card
 *  4. the largest visible <h1>
 * Never modifies the page.
 */
export interface BossTarget {
  /** Page element (null for the synthetic og:site_name card). */
  el: Element | null;
  rect: Rect;
  sprite: Sprite;
  /** Display name source: alt text, site name, or heading text. */
  label: string;
}

const LOGO_IMG = [
  'header img',
  'img[class*="logo" i]',
  'img[id*="logo" i]',
  'img[alt*="logo" i]',
  '[class*="logo" i] img',
  '[id*="logo" i] img',
  '[aria-label*="logo" i] img',
].join(', ');

const LOGO_SVG = ['a[href="/"] svg', 'header a svg', '[class*="logo" i] svg', '[aria-label*="logo" i] svg'].join(', ');

function visibleRect(el: Element, minW: number, minH: number): Rect | null {
  const r = el.getBoundingClientRect();
  if (r.width < minW || r.height < minH) return null;
  if (r.bottom <= 0 || r.right <= 0 || r.top >= window.innerHeight || r.left >= window.innerWidth) return null;
  const cs = getComputedStyle(el);
  if (cs.visibility !== 'visible' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function isRootLink(a: Element | null): boolean {
  if (!(a instanceof HTMLAnchorElement)) return false;
  try {
    const u = new URL(a.href, location.href);
    return u.origin === location.origin && (u.pathname === '/' || u.pathname === '');
  } catch {
    return false;
  }
}

/** og:site_name if the page declares one, else the hostname. */
export function siteName(): string {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content?.trim();
  return og || location.hostname.replace(/^www\./, '') || document.title.slice(0, 30) || 'THE PAGE';
}

/** Inline <svg> → image, so the real logo can be drawn on canvas. */
async function snapshotSvg(svg: SVGSVGElement, rect: Rect): Promise<Sprite | null> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(Math.round(rect.w)));
  clone.setAttribute('height', String(Math.round(rect.h)));
  // currentColor would resolve to black inside an <img>; bake the real colour in.
  clone.style.color = getComputedStyle(svg).color;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  const img = await loadImage(url, 400);
  if (!img) return null;
  const canvas = document.createElement('canvas');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.w * scale));
  canvas.height = Math.max(1, Math.round(rect.h * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  try {
    ctx.drawImage(img, 0, 0, rect.w, rect.h);
  } catch {
    return null;
  }
  return { canvas, w: rect.w, h: rect.h, text: siteName() };
}

/** Option 3: favicon + og:site_name as a generated card. */
async function syntheticBoss(): Promise<BossTarget> {
  const name = siteName();
  const w = Math.min(320, 80 + name.length * 14);
  const h = 72;
  const sprite = makeTextSprite(name.toUpperCase(), w, h, '#0d0d10', '#ffffff');
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]');
  const iconUrl = link?.href || (location.protocol.startsWith('http') ? `${location.origin}/favicon.ico` : '');
  const icon = iconUrl ? await loadImage(iconUrl, 400) : null;
  const ctx = sprite.canvas.getContext('2d')!;
  if (icon) {
    try {
      ctx.drawImage(icon, 8, 8, h - 16, h - 16);
    } catch {
      /* ignore */
    }
  } else if (!name) {
    drawProceduralArmor(ctx, w, h, 'BOSS');
  }
  armorize(sprite, name);
  return {
    el: null,
    rect: { x: (window.innerWidth - w) / 2, y: 24, w, h },
    sprite,
    label: name,
  };
}

export async function findBoss(): Promise<BossTarget> {
  // 1. Logo image.
  for (const img of document.querySelectorAll(LOGO_IMG)) {
    const rect = visibleRect(img, 24, 14);
    if (!rect || rect.w * rect.h > window.innerWidth * window.innerHeight * 0.25) continue;
    const label = (img as HTMLImageElement).alt?.trim() || siteName();
    return { el: img, rect, sprite: snapshotElement(img, rect), label };
  }
  // 2. Logo SVG linking home.
  for (const svg of document.querySelectorAll<SVGSVGElement>(LOGO_SVG)) {
    if (!(svg instanceof SVGSVGElement)) continue;
    if (!isRootLink(svg.closest('a')) && !svg.closest('header, [class*="logo" i], [aria-label*="logo" i]')) continue;
    const rect = visibleRect(svg, 20, 14);
    if (!rect) continue;
    const sprite = await snapshotSvg(svg, rect);
    if (sprite) return { el: svg, rect, sprite, label: siteName() };
  }
  // 3. og:site_name + favicon.
  if (document.querySelector('meta[property="og:site_name"]')) return syntheticBoss();
  // 4. Largest visible <h1>.
  let best: { el: Element; rect: Rect } | null = null;
  for (const h1 of document.querySelectorAll('h1')) {
    const rect = visibleRect(h1, 40, 16);
    if (rect && (!best || rect.w * rect.h > best.rect.w * best.rect.h)) best = { el: h1, rect };
  }
  if (best) {
    const sprite = snapshotElement(best.el, best.rect);
    return { el: best.el, rect: best.rect, sprite, label: sprite.text.slice(0, 40) };
  }
  return syntheticBoss();
}
