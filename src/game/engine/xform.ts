/**
 * The world (camera) transform as plain numbers, so per-item rotation can be
 * applied with a single setTransform() — no save()/restore(), no DOMMatrix,
 * no allocation. game.ts sets it once per frame; renderers call place().
 */
const M = new Float64Array(6); // a b c d e f

/** dpr scale + camera shake (translate) + camera roll around the screen centre. */
export function setWorld(dpr: number, w: number, h: number, shakeX: number, shakeY: number, rot: number): void {
  const cos = Math.cos(rot) * dpr;
  const sin = Math.sin(rot) * dpr;
  const cx = w / 2;
  const cy = h / 2;
  // T(cx+sx, cy+sy) · R(rot) · T(-cx, -cy), all scaled by dpr.
  M[0] = cos;
  M[1] = sin;
  M[2] = -sin;
  M[3] = cos;
  M[4] = (cx + shakeX) * dpr - cos * cx + sin * cy;
  M[5] = (cy + shakeY) * dpr - sin * cx - cos * cy;
}

export function applyWorld(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(M[0]!, M[1]!, M[2]!, M[3]!, M[4]!, M[5]!);
}

/** World transform · translate(x, y) · rotate(angle). */
export function place(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const a = M[0]!;
  const b = M[1]!;
  const cc = M[2]!;
  const d = M[3]!;
  ctx.setTransform(a * c + cc * s, b * c + d * s, -a * s + cc * c, -b * s + d * c, a * x + cc * y + M[4]!, b * x + d * y + M[5]!);
}
