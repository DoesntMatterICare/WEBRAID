import { MONO_FONT, PALETTE } from './render';

const MAX_CRACKS = 7;

/**
 * Persistent page damage, drawn into its own canvas so it accumulates over the
 * raid: torn holes where elements were ripped out (with their real HTML
 * showing through, like the page's insides) and cracks from big impacts.
 */
export class PageDamage {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cracks = 0;

  constructor() {
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    // Keep existing damage across resizes.
    const old = this.canvas.width > 0 ? this.copy() : null;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (old) this.ctx.drawImage(old, 0, 0, w, h);
  }

  private copy(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    c.getContext('2d')!.drawImage(this.canvas, 0, 0);
    return c;
  }

  /** Rip a hole where an element used to be. */
  tear(x: number, y: number, w: number, h: number, source: string): void {
    // Thin strips (nav labels, slim headers) would only leave jagged slivers
    // that read as glitches, not holes.
    if (h < 26 || w < 36) return;
    const g = this.ctx;
    const pts = jaggedRect(x, y, w, h);

    // Paper lip: the torn edge is slightly larger and lighter than the hole.
    g.save();
    g.fillStyle = PALETTE.paperDark;
    tracePath(g, jaggedRect(x - 3, y - 3, w + 6, h + 6));
    g.fill();
    g.strokeStyle = PALETTE.line;
    g.lineWidth = 1;
    g.stroke();

    // The void, with the element's source code printed inside.
    tracePath(g, pts);
    g.fillStyle = PALETTE.hole;
    g.fill();
    g.clip();
    const size = h < 30 ? 8 : 10;
    const lh = size + 3;
    g.font = `500 ${size}px ${MONO_FONT}`;
    g.textBaseline = 'top';
    const lines = wrapSource(g, source, Math.max(20, w - 8), Math.ceil(h / lh) + 1);
    let ly = y + 3;
    for (const line of lines) {
      drawSyntax(g, line, x + 4, ly);
      ly += lh;
    }
    // Inner shadow along the top edge sells the depth.
    const sh = g.createLinearGradient(0, y, 0, y + Math.min(14, h));
    sh.addColorStop(0, 'rgba(0,0,0,.7)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(x - 4, y - 4, w + 8, Math.min(18, h + 4));
    g.restore();
  }

  /** Spider-web crack radiating from an impact. */
  crack(x: number, y: number, size: number, force = false): void {
    // A few cracks read as impact; dozens read as a broken renderer.
    if (!force && this.cracks >= MAX_CRACKS) return;
    this.cracks++;
    const g = this.ctx;
    g.save();
    g.globalAlpha = 0.7;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const arms = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < arms; i++) {
      let a = (i / arms) * Math.PI * 2 + Math.random() * 0.6;
      let px = x;
      let py = y;
      const steps = 4 + Math.floor(Math.random() * 4);
      const seg = (size / steps) * (0.6 + Math.random() * 0.8);
      const path: Array<[number, number]> = [[px, py]];
      for (let s = 0; s < steps; s++) {
        a += (Math.random() - 0.5) * 0.7;
        px += Math.cos(a) * seg;
        py += Math.sin(a) * seg;
        path.push([px, py]);
      }
      for (const [lw, color, dx] of [[2.4, PALETTE.paper, 1], [1.1, PALETTE.line, 0]] as const) {
        g.strokeStyle = color;
        g.lineWidth = lw;
        g.beginPath();
        path.forEach(([cx, cy], j) => (j ? g.lineTo(cx + dx, cy + dx) : g.moveTo(cx + dx, cy + dx)));
        g.stroke();
      }
    }
    // Concentric fracture ring.
    g.strokeStyle = PALETTE.line;
    g.globalAlpha = 0.4;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = size * 0.28 * (0.8 + Math.random() * 0.4);
      const cx = x + Math.cos(a) * r;
      const cy = y + Math.sin(a) * r;
      if (i) g.lineTo(cx, cy);
      else g.moveTo(cx, cy);
    }
    g.stroke();
    g.restore();
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }

  get pixelRatio(): number {
    return this.dpr;
  }
}

function jaggedRect(x: number, y: number, w: number, h: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const step = 7;
  const j = (): number => (Math.random() - 0.5) * 4;
  for (let px = x; px < x + w; px += step) pts.push([px, y + j()]);
  for (let py = y; py < y + h; py += step) pts.push([x + w + j(), py]);
  for (let px = x + w; px > x; px -= step) pts.push([px, y + h + j()]);
  for (let py = y + h; py > y; py -= step) pts.push([x + j(), py]);
  return pts;
}

function tracePath(g: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.closePath();
}

function wrapSource(g: CanvasRenderingContext2D, source: string, width: number, maxLines: number): string[] {
  const flat = source.replace(/\s+/g, ' ');
  const lines: string[] = [];
  let line = '';
  for (const ch of flat) {
    if (g.measureText(line + ch).width > width) {
      lines.push(line);
      line = '';
      if (lines.length >= maxLines) break;
    }
    line += ch;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** Minimal view-source colouring: tags, attribute names, strings, text. */
function drawSyntax(g: CanvasRenderingContext2D, line: string, x: number, y: number): void {
  const tokens = line.split(/(<\/?[a-zA-Z0-9-]+|>|"[^"]*"?|\s[a-zA-Z-:]+=)/);
  let cx = x;
  for (const tok of tokens) {
    if (!tok) continue;
    g.fillStyle = tok.startsWith('<') || tok === '>'
      ? '#ff6b6b'
      : tok.startsWith('"')
        ? '#ffe14d'
        : tok.endsWith('=')
          ? '#7aa2ff'
          : '#8d8d98';
    g.fillText(tok, cx, y);
    cx += g.measureText(tok).width;
  }
}
