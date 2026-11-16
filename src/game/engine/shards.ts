/**
 * Destruction shards.
 *
 * On death an enemy's snapshot is sliced ONCE into jittered triangles; each
 * triangle is clipped and baked into a cell of a preallocated atlas canvas.
 * Per frame a shard is a single drawImage of its atlas cell — no clip(), no
 * paths, no allocations. All state lives in fixed typed arrays (struct of
 * arrays); when the atlas or pool is full, a kill simply emits fewer shards.
 *
 * The atlas may hold cross-origin (tainted) pixels. That is fine: it is only
 * ever drawn, never read — and the share card never touches it.
 */

import { applyWorld, place } from './xform';

const CELL = 56; // atlas cell size in px
const ATLAS_CELLS_X = 20;
const ATLAS_CELLS_Y = 20;
/** Hard cap: one live shard per atlas cell. */
export const MAX_SHARDS = ATLAS_CELLS_X * ATLAS_CELLS_Y;
/** Most triangles a single kill may produce. */
const MAX_PER_KILL = 60;
const MAX_GRID = 8;
/** Triangles baked per update step; beyond it kills shatter into coarser grids. */
const BAKE_BUDGET = 90;

export class ShardSystem {
  private readonly atlas = document.createElement('canvas');
  private readonly actx: CanvasRenderingContext2D;

  // Free atlas cells (stack).
  private readonly free = new Int16Array(MAX_SHARDS);
  private freeTop = 0;

  // Live shards, struct-of-arrays, densely packed [0, count).
  count = 0;
  private readonly x = new Float32Array(MAX_SHARDS);
  private readonly y = new Float32Array(MAX_SHARDS);
  private readonly vx = new Float32Array(MAX_SHARDS);
  private readonly vy = new Float32Array(MAX_SHARDS);
  private readonly rot = new Float32Array(MAX_SHARDS);
  private readonly vr = new Float32Array(MAX_SHARDS);
  private readonly life = new Float32Array(MAX_SHARDS);
  private readonly maxLife = new Float32Array(MAX_SHARDS);
  private readonly dw = new Float32Array(MAX_SHARDS); // display size
  private readonly dh = new Float32Array(MAX_SHARDS);
  private readonly sw = new Float32Array(MAX_SHARDS); // size inside atlas cell
  private readonly sh = new Float32Array(MAX_SHARDS);
  private readonly cell = new Int16Array(MAX_SHARDS);

  // Scratch lattice for slicing (reused every kill).
  private readonly lx = new Float32Array((MAX_GRID + 1) * (MAX_GRID + 1));
  private readonly ly = new Float32Array((MAX_GRID + 1) * (MAX_GRID + 1));
  private readonly tri = new Float32Array(6);

  edgeColor = '#0d0d10';
  private baked = 0;

  constructor() {
    this.atlas.width = CELL * ATLAS_CELLS_X;
    this.atlas.height = CELL * ATLAS_CELLS_Y;
    this.actx = this.atlas.getContext('2d')!;
    for (let i = 0; i < MAX_SHARDS; i++) this.free[i] = MAX_SHARDS - 1 - i;
    this.freeTop = MAX_SHARDS;
  }

  get freeCells(): number {
    return this.freeTop;
  }

  private cellX(c: number): number {
    return (c % ATLAS_CELLS_X) * CELL;
  }

  private cellY(c: number): number {
    return Math.floor(c / ATLAS_CELLS_X) * CELL;
  }

  /**
   * Slice `source` (shown at w×h, centred on cx,cy) into polygon shards.
   * cropW/cropH: visible fraction of the source (cropped text cards).
   */
  shatter(
    source: HTMLCanvasElement,
    cx: number,
    cy: number,
    w: number,
    h: number,
    cols: number,
    rows: number,
    force: number,
    cropW = 1,
    cropH = 1,
  ): void {
    cols = Math.max(1, Math.min(MAX_GRID, cols));
    rows = Math.max(1, Math.min(MAX_GRID, rows));
    // Stay inside this frame's bake budget: shrink the grid rather than hitch.
    const room = BAKE_BUDGET - this.baked;
    if (room < 2) return;
    while (cols * rows * 2 > room && (cols > 1 || rows > 1)) {
      if (cols >= rows) cols--;
      else rows--;
    }
    const stride = cols + 1;
    // Jittered lattice; border points stay on the edge so pieces tile the card.
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const k = j * stride + i;
        const jx = i > 0 && i < cols ? (Math.random() - 0.5) * 0.7 : 0;
        const jy = j > 0 && j < rows ? (Math.random() - 0.5) * 0.7 : 0;
        this.lx[k] = ((i + jx) / cols) * w;
        this.ly[k] = ((j + jy) / rows) * h;
      }
    }
    const srcW = source.width * cropW;
    const srcH = source.height * cropH;
    let made = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * stride + i;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        // Two triangles per lattice quad (a b / c d), split along a random diagonal.
        const diagAD = Math.random() < 0.5;
        for (let t = 0; t < 2; t++) {
          if (made >= MAX_PER_KILL || this.freeTop === 0 || this.count >= MAX_SHARDS) return;
          let p0: number, p1: number, p2: number;
          if (diagAD) [p0, p1, p2] = t === 0 ? [a, b, d] : [a, d, c];
          else [p0, p1, p2] = t === 0 ? [a, b, c] : [b, d, c];
          this.tri[0] = this.lx[p0]!;
          this.tri[1] = this.ly[p0]!;
          this.tri[2] = this.lx[p1]!;
          this.tri[3] = this.ly[p1]!;
          this.tri[4] = this.lx[p2]!;
          this.tri[5] = this.ly[p2]!;
          if (this.bake(source, srcW, srcH, w, h, cx, cy, force)) made++;
        }
      }
    }
  }

  /** Clip the current triangle into a fresh atlas cell and spawn its shard. */
  private bake(source: HTMLCanvasElement, srcW: number, srcH: number, w: number, h: number, cx: number, cy: number, force: number): boolean {
    const t = this.tri;
    const bx = Math.min(t[0]!, t[2]!, t[4]!);
    const by = Math.min(t[1]!, t[3]!, t[5]!);
    const bw = Math.max(t[0]!, t[2]!, t[4]!) - bx;
    const bh = Math.max(t[1]!, t[3]!, t[5]!) - by;
    if (bw < 1 || bh < 1) return false;

    const c = this.free[--this.freeTop]!;
    const k = Math.min(1.5, (CELL - 2) / Math.max(bw, bh));
    const ox = this.cellX(c);
    const oy = this.cellY(c);
    const g = this.actx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(ox, oy, CELL, CELL);
    g.save();
    g.setTransform(k, 0, 0, k, ox + 1 - bx * k, oy + 1 - by * k);
    g.beginPath();
    g.moveTo(t[0]!, t[1]!);
    g.lineTo(t[2]!, t[3]!);
    g.lineTo(t[4]!, t[5]!);
    g.closePath();
    g.save();
    g.clip();
    // Copy only this triangle's bounding box from the source, not the whole sprite.
    const kx = srcW / w;
    const ky = srcH / h;
    const px = Math.max(0, bx - 1);
    const py = Math.max(0, by - 1);
    const pw = Math.min(w - px, bw + 2);
    const ph = Math.min(h - py, bh + 2);
    if (pw > 0 && ph > 0) g.drawImage(source, px * kx, py * ky, pw * kx, ph * ky, px, py, pw, ph);
    g.restore();
    g.lineWidth = 1.5 / k;
    g.strokeStyle = this.edgeColor;
    g.stroke();
    g.restore();

    this.baked++;
    const i = this.count++;
    const sx = cx - w / 2 + bx + bw / 2;
    const sy = cy - h / 2 + by + bh / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const d = Math.hypot(dx, dy) || 1;
    const s = force * (0.5 + Math.random() * 0.8);
    this.x[i] = sx;
    this.y[i] = sy;
    this.vx[i] = (dx / d) * s + (Math.random() - 0.5) * force * 0.6;
    this.vy[i] = (dy / d) * s + (Math.random() - 0.5) * force * 0.6 - force * 0.4;
    this.rot[i] = 0;
    this.vr[i] = (Math.random() - 0.5) * 14;
    this.maxLife[i] = this.life[i] = 0.9 + Math.random() * 0.7;
    this.dw[i] = bw;
    this.dh[i] = bh;
    this.sw[i] = bw * k;
    this.sh[i] = bh * k;
    this.cell[i] = c;
    return true;
  }

  private remove(i: number): void {
    this.free[this.freeTop++] = this.cell[i]!;
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.rot[i] = this.rot[last]!;
    this.vr[i] = this.vr[last]!;
    this.life[i] = this.life[last]!;
    this.maxLife[i] = this.maxLife[last]!;
    this.dw[i] = this.dw[last]!;
    this.dh[i] = this.dh[last]!;
    this.sw[i] = this.sw[last]!;
    this.sh[i] = this.sh[last]!;
    this.cell[i] = this.cell[last]!;
  }

  update(dt: number): void {
    this.baked = 0;
    const drag = 1 - Math.min(1, dt);
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        this.remove(i);
        continue;
      }
      this.vy[i]! += 1200 * dt;
      this.vx[i]! *= drag;
      this.vy[i]! *= drag;
      this.x[i]! += this.vx[i]! * dt;
      this.y[i]! += this.vy[i]! * dt;
      this.rot[i]! += this.vr[i]! * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.count; i++) {
      const c = this.cell[i]!;
      ctx.globalAlpha = Math.min(1, (this.life[i]! / this.maxLife[i]!) * 2.5);
      place(ctx, this.x[i]!, this.y[i]!, this.rot[i]!); // one setTransform, no save/restore
      ctx.drawImage(this.atlas, this.cellX(c) + 1, this.cellY(c) + 1, this.sw[i]!, this.sh[i]!, -this.dw[i]! / 2, -this.dh[i]! / 2, this.dw[i]!, this.dh[i]!);
    }
    applyWorld(ctx);
    ctx.globalAlpha = 1;
  }

  clear(): void {
    while (this.count > 0) this.remove(this.count - 1);
  }
}
