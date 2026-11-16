/** Uniform-grid spatial hash for broad-phase collision. Reuses its bucket arrays. */
export class SpatialHash<T> {
  private cells = new Map<number, T[]>();
  private spare: T[][] = [];

  constructor(private readonly size = 96) {}

  private key(cx: number, cy: number): number {
    return (cx + 2048) * 8192 + (cy + 2048);
  }

  clear(): void {
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
      this.spare.push(bucket);
    }
    this.cells.clear();
  }

  /** Insert an axis-aligned box (top-left x/y). */
  insert(item: T, x: number, y: number, w: number, h: number): void {
    const s = this.size;
    const x0 = Math.floor(x / s);
    const y0 = Math.floor(y / s);
    const x1 = Math.floor((x + w) / s);
    const y1 = Math.floor((y + h) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = this.spare.pop() ?? [];
          this.cells.set(k, bucket);
        }
        bucket.push(item);
      }
    }
  }

  /** Items whose (inflated) box overlaps the cell containing this point. */
  at(x: number, y: number): readonly T[] | undefined {
    return this.cells.get(this.key(Math.floor(x / this.size), Math.floor(y / this.size)));
  }
}

export function circleRect(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number): boolean {
  const nx = cx < x ? x : cx > x + w ? x + w : cx;
  const ny = cy < y ? y : cy > y + h ? y + h : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}
