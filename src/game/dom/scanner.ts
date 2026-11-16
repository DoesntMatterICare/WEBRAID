import type { EnemyKind, EnemySpec, Rect } from '@/shared/types';
import { loadImage, makeTextSprite, snapshotBackground, snapshotElement, snapshotFrame, visibleText } from './snapshot';

/** Hard cap on enemies per raid (PROJECT.md §4). */
export const MAX_ENEMIES = 150;
/** Page elements held back for the boss to summon in phase 2. */
const RESERVE = 8;
/** Live-streaming video sprites are the expensive kind; cap them. */
const MAX_LIVE_VIDEOS = 4;
const BG_SAMPLE_STEP = 56;
const BG_LOAD_TIMEOUT = 350;

interface Group {
  kind: EnemyKind;
  selector: string;
  limit: number;
  minW: number;
  minH: number;
}

// Order matters: earlier groups claim elements first, and a later element that
// contains or sits inside an already-claimed one is skipped.
/** Ads and embeds: claimed first, because ad slots contain images and links. */
const TOXIC: Group = {
  kind: 'toxic',
  selector:
    'iframe, ins.adsbygoogle, [id^="google_ads" i], [data-ad-slot], [data-ad], [aria-label="Advertisement" i], [aria-label="Sponsored" i]',
  limit: 8,
  minW: 60,
  minH: 40,
};
const MEDIA: Group = { kind: 'brute', selector: 'img, video, canvas', limit: 36, minW: 28, minH: 28 };
const BACKGROUNDS: Group = { kind: 'brute', selector: '', limit: 24, minW: 40, minH: 40 };
const TEXT_GROUPS: Group[] = [
  { kind: 'tank', selector: 'h1, h2, h3, [role="heading"]', limit: 24, minW: 17, minH: 12 },
  // App-style sites (NotebookLM, dashboards) are mostly buttons: they become turrets.
  {
    kind: 'turret',
    selector: 'button, [role="button"], input[type="submit"], input[type="button"], [role="tab"], [role="menuitem"]',
    limit: 30,
    minW: 24,
    minH: 18,
  },
  // Big text blocks fight as tanks (they fire their own letters).
  { kind: 'tank', selector: 'p, [role="article"] > div', limit: 8, minW: 200, minH: 40 },
  { kind: 'swarmer', selector: 'a[href], [role="link"]', limit: 110, minW: 17, minH: 10 },
];

/** Class/id tokens that mark ad containers ("ad-slot", "ads_top", "sponsored"…). */
const AD_TOKEN = /^(ad|ads|advert|advertisement|sponsor|sponsored|promoted)([-_]|$)/i;

// ------------------------------------------------------------ DOM helpers

/** Every open shadow root on the page (Reddit, many design-system sites). */
function shadowRoots(): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const visit = (root: Document | ShadowRoot): void => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        visit(el.shadowRoot);
      }
    }
  };
  visit(document);
  return roots;
}

function deepQuery(selector: string, roots: ShadowRoot[]): Element[] {
  const out = Array.from(document.querySelectorAll(selector));
  for (const r of roots) out.push(...r.querySelectorAll(selector));
  return out;
}

/** Shadow-aware "a contains b". */
function deepContains(a: Element, b: Element): boolean {
  let node: Node | null = b;
  while (node) {
    if (node === a) return true;
    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
  }
  return false;
}

function isTransparent(color: string): boolean {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color === 'transparent';
  const parts = m[1]!.split(/[\s,/]+/).filter(Boolean);
  return parts.length === 4 && parseFloat(parts[3]!) < 0.5;
}

/**
 * Social sites lay invisible click-catchers and gradient scrims over media
 * (Instagram, TikTok, YouTube). Those must not count as "covering" it.
 */
function isSeeThrough(el: Element): boolean {
  if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLCanvasElement || el instanceof HTMLIFrameElement) {
    return parseFloat(getComputedStyle(el).opacity) < 0.1;
  }
  const cs = getComputedStyle(el);
  if (parseFloat(cs.opacity) < 0.1) return true;
  if (cs.backgroundImage.includes('url(')) return false;
  return isTransparent(cs.backgroundColor);
}

/** Is `el` the thing a user actually sees at (x,y)? */
function isOnTop(el: Element, x: number, y: number): boolean {
  const root = el.getRootNode() as Document | ShadowRoot;
  const stack = root.elementsFromPoint(x, y);
  for (let i = 0; i < Math.min(stack.length, 10); i++) {
    const s = stack[i]!;
    if (s === el || deepContains(s, el) || deepContains(el, s)) return true;
    if (!isSeeThrough(s)) return false;
  }
  return false;
}

function usableRect(el: Element, g: Group, vw: number, vh: number): Rect | null {
  const r = el.getBoundingClientRect();
  if (r.width < g.minW || r.height < g.minH) return null;
  // Page-sized backgrounds are not enemies — but a big video player is.
  const big = el instanceof HTMLVideoElement || el instanceof HTMLIFrameElement ? 0.95 : 0.6;
  if (r.width * r.height > vw * vh * big) return null;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  if (cx < 0 || cy < 0 || cx > vw || cy > vh) return null;

  const cs = getComputedStyle(el);
  if (cs.visibility !== 'visible' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) return null;
  if (!isOnTop(el, cx, cy)) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function firstUrl(backgroundImage: string): string | null {
  const m = backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
  return m?.[2] || null;
}

// ------------------------------------------------------------ scanning

interface Scan {
  vw: number;
  vh: number;
  /** Claimed elements. */
  chosen: Set<Node>;
  /** Every ancestor of a claimed element (so containers of enemies are skipped). */
  containers: Set<Node>;
  specs: EnemySpec[];
  liveVideos: number;
}

function parentOf(node: Node): Node | null {
  return node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
}

/** O(depth): is `el` inside, or an ancestor of, something already claimed? */
function overlapsChosen(scan: Scan, el: Element): boolean {
  if (scan.containers.has(el)) return true;
  for (let n: Node | null = el; n; n = parentOf(n)) if (scan.chosen.has(n)) return true;
  return false;
}

function reserveElement(scan: Scan, el: Element): void {
  scan.chosen.add(el);
  for (let n = parentOf(el); n; n = parentOf(n)) scan.containers.add(n);
}

function claim(scan: Scan, spec: EnemySpec): void {
  if (spec.el) reserveElement(scan, spec.el);
  scan.specs.push(spec);
}

function isAdContainer(el: Element): boolean {
  for (const token of el.classList) if (AD_TOKEN.test(token)) return true;
  return AD_TOKEN.test(el.id);
}

function scanToxic(scan: Scan, roots: ShadowRoot[]): void {
  const candidates = deepQuery(TOXIC.selector, roots);
  // Class/id-named ad containers, checked by token so "header-" never matches.
  for (const el of document.querySelectorAll('[class*="ad" i], [id*="ad" i], [class*="sponsor" i], [class*="promo" i]')) {
    if (isAdContainer(el)) candidates.push(el);
  }
  let count = 0;
  for (const el of candidates) {
    if (count >= TOXIC.limit || scan.specs.length >= MAX_ENEMIES) break;
    if (overlapsChosen(scan, el)) continue;
    const rect = usableRect(el, TOXIC, scan.vw, scan.vh);
    if (!rect) continue;
    claim(scan, { kind: 'toxic', rect, el, sprite: snapshotFrame(el, rect) });
    count++;
  }
}

function scanMedia(scan: Scan, roots: ShadowRoot[]): void {
  let count = 0;
  for (const el of deepQuery(MEDIA.selector, roots)) {
    if (count >= MEDIA.limit || scan.specs.length >= MAX_ENEMIES) break;
    if (overlapsChosen(scan, el)) continue;
    const rect = usableRect(el, MEDIA, scan.vw, scan.vh);
    if (!rect) continue;
    const sprite = snapshotElement(el, rect);
    let hide: EnemySpec['hide'];
    if (el instanceof HTMLVideoElement) {
      hide = 'opacity';
      if (scan.liveVideos >= MAX_LIVE_VIDEOS) delete sprite.live;
      else scan.liveVideos++;
    }
    claim(scan, { kind: 'brute', rect, el, sprite, hide });
    count++;
  }
}

/**
 * CSS background-image media (X/Twitter photos, card grids). Found by sampling
 * a grid of points, which keeps it proportional to the viewport, not the DOM.
 */
async function scanBackgrounds(scan: Scan): Promise<void> {
  const seen = new Set<Element>();
  const found: Array<{ el: Element; rect: Rect; url: string }> = [];
  for (let y = BG_SAMPLE_STEP / 2; y < scan.vh; y += BG_SAMPLE_STEP) {
    for (let x = BG_SAMPLE_STEP / 2; x < scan.vw; x += BG_SAMPLE_STEP) {
      const stack = document.elementsFromPoint(x, y);
      for (let i = 0; i < Math.min(stack.length, 8); i++) {
        const el = stack[i]!;
        if (seen.has(el) || el === document.body || el === document.documentElement) continue;
        seen.add(el);
        const url = firstUrl(getComputedStyle(el).backgroundImage);
        if (!url || url.startsWith('data:image/svg')) continue;
        if (overlapsChosen(scan, el) || found.some((f) => deepContains(f.el, el) || deepContains(el, f.el))) continue;
        const rect = usableRect(el, BACKGROUNDS, scan.vw, scan.vh);
        if (rect) found.push({ el, rect, url });
        if (found.length >= BACKGROUNDS.limit) break;
      }
    }
  }
  if (!found.length) return;
  const images = await Promise.all(found.map((f) => loadImage(f.url, BG_LOAD_TIMEOUT)));
  found.forEach((f, i) => {
    const img = images[i];
    if (!img || scan.specs.length >= MAX_ENEMIES) return;
    claim(scan, { kind: 'brute', rect: f.rect, el: f.el, sprite: snapshotBackground(f.el, f.rect, img) });
  });
}

function scanText(scan: Scan, roots: ShadowRoot[]): void {
  for (const g of TEXT_GROUPS) {
    let count = 0;
    for (const el of deepQuery(g.selector, roots)) {
      if (count >= g.limit || scan.specs.length >= MAX_ENEMIES) break;
      if (!visibleText(el)) continue;
      if (overlapsChosen(scan, el)) continue;
      const rect = usableRect(el, g, scan.vw, scan.vh);
      if (!rect) continue;
      claim(scan, { kind: g.kind, rect, el, sprite: snapshotElement(el, rect) });
      count++;
    }
  }
}

export interface ScanResult {
  /** Enemies for the waves. */
  specs: EnemySpec[];
  /** Leftover page elements the boss summons as minions in phase 2. */
  reserve: EnemySpec[];
}

/**
 * Walks the visible page and turns elements into enemy specs. Does not modify
 * the page. `exclude` (the boss element) is never turned into a regular enemy.
 */
export async function scanPage(exclude: Element | null = null): Promise<ScanResult> {
  const scan: Scan = {
    vw: window.innerWidth,
    vh: window.innerHeight,
    chosen: new Set(),
    containers: new Set(),
    specs: [],
    liveVideos: 0,
  };
  if (exclude) reserveElement(scan, exclude);
  const roots = shadowRoots();
  scanToxic(scan, roots);
  scanMedia(scan, roots);
  await scanBackgrounds(scan);
  scanText(scan, roots);

  // Hold back a few small enemies (links/buttons) for the boss to summon.
  const reserve: EnemySpec[] = [];
  const small = scan.specs.filter((s) => s.kind === 'swarmer' || s.kind === 'turret');
  if (small.length > 20) {
    for (const s of small.slice(-RESERVE)) {
      reserve.push(s);
      scan.specs.splice(scan.specs.indexOf(s), 1);
    }
  }
  return { specs: scan.specs, reserve };
}

const FILLER_WORDS = ['404', 'COOKIES?', 'SUBSCRIBE', 'POP-UP', 'AD', 'LOADING', 'CAPTCHA', 'SIGN UP', 'TL;DR', 'NEWSLETTER'];

/** Sparse page? Spawn glitchy "page fragments" so there is still a fight (PROJECT.md §11). */
export function fillerSpecs(count: number, avoid: { x: number; y: number }): EnemySpec[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const words = [...document.title.split(/\s+/).filter((w) => w.length > 2).slice(0, 6), ...FILLER_WORDS];
  const specs: EnemySpec[] = [];
  for (let i = 0; i < count; i++) {
    const text = words[i % words.length]!.slice(0, 14).toUpperCase();
    const kind: EnemyKind = i % 6 === 5 ? 'tank' : 'swarmer';
    const h = kind === 'tank' ? 40 : 26;
    const w = Math.min(260, 24 + text.length * h * 0.4);
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = 20 + Math.random() * Math.max(1, vw - w - 40);
      y = 20 + Math.random() * Math.max(1, vh * 0.6 - h);
      if (Math.hypot(x + w / 2 - avoid.x, y + h / 2 - avoid.y) > 220) break;
    }
    const bg = kind === 'tank' ? '#ffe14d' : '#ffffff';
    specs.push({ kind, el: null, rect: { x, y, w, h }, sprite: makeTextSprite(text, w, h, '#0d0d10', bg) });
  }
  return specs;
}
