/**
 * WEBRAID visual language: "web brutalism". The game is drawn with the web's
 * own materials — paper, ink, selection blue, link blue, highlighter yellow,
 * error red — instead of generic sci-fi neon.
 */

const LIGHT = {
  /** Always-dark text colour (text on yellow/red chips). */
  ink: '#0d0d10',
  /** Outlines, hard shadows, cracks — contrasts with the page. */
  line: '#0d0d10',
  /** The "surface" colour opposite to `line`. */
  paper: '#f3f1ea',
  paperDark: '#d9d6cc',
  cursorFill: '#ffffff',
  halftone: 'rgba(13,13,16,0.16)',
  hole: '#121216',
  select: '#2f6bff',
  selectSoft: 'rgba(47,107,255,0.42)',
  link: '#2a3cff',
  visited: '#7b2cff',
  marker: '#ffe14d',
  error: '#ff3131',
  ok: '#13b26b',
  white: '#ffffff',
};

/** Dark sites (YouTube, X, NotebookLM, Discord…): same language, inverted lines. */
const DARK: typeof LIGHT = {
  ...LIGHT,
  line: '#f3f1ea',
  paper: '#0d0d10',
  paperDark: '#55545c',
  cursorFill: '#0d0d10',
  halftone: 'rgba(243,241,234,0.09)',
  hole: '#000000',
  selectSoft: 'rgba(80,130,255,0.5)',
  link: '#6d8bff',
};

export type Palette = typeof LIGHT;
export const PALETTE: Palette = { ...LIGHT };

export function applyTheme(dark: boolean): void {
  Object.assign(PALETTE, dark ? DARK : LIGHT);
}

function luminance(color: string): number | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a] = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
  if (a !== undefined && a < 0.5) return null;
  return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
}

/** Is the page the user is looking at mostly dark? Samples real backgrounds. */
export function detectDarkPage(): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const points: Array<[number, number]> = [
    [vw * 0.5, vh * 0.5], [vw * 0.2, vh * 0.3], [vw * 0.8, vh * 0.3], [vw * 0.2, vh * 0.75], [vw * 0.8, vh * 0.75],
  ];
  let dark = 0;
  let total = 0;
  for (const [x, y] of points) {
    let node: Element | null = document.elementFromPoint(x, y);
    let lum: number | null = null;
    while (node && lum === null) {
      lum = luminance(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    lum ??= 1; // browser default canvas is white
    total++;
    if (lum < 0.4) dark++;
  }
  return dark / total > 0.5;
}

export const UI_FONT = '"Inter Tight", Inter, "Segoe UI Variable Display", "Segoe UI", "SF Pro Display", system-ui, sans-serif';
export const MONO_FONT = '"JetBrains Mono", "Cascadia Code", "SF Mono", ui-monospace, Consolas, monospace';

export const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Newsprint halftone dots laid over the greyed-out page. */
export function makeHalftone(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 6;
  const g = c.getContext('2d')!;
  g.fillStyle = PALETTE.halftone;
  g.beginPath();
  g.arc(3, 3, 0.9, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Hard brutalist drop shadow (solid ink, offset down-right). */
export function hardShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, off: number): void {
  ctx.fillStyle = PALETTE.line;
  ctx.beginPath();
  ctx.roundRect(x + off, y + off, w, h, r);
  ctx.fill();
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Classic arrow mouse pointer, tip at (0,0), body toward +x/+y. */
export function cursorPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17 * s);
  ctx.lineTo(4 * s, 13 * s);
  ctx.lineTo(7 * s, 20 * s);
  ctx.lineTo(10 * s, 19 * s);
  ctx.lineTo(7 * s, 12 * s);
  ctx.lineTo(12 * s, 12 * s);
  ctx.closePath();
}

/** Angle of the pointer's own axis (from body toward tip) in cursorPath space. */
export const CURSOR_AXIS = Math.atan2(-12, -5);
