/**
 * Chromatic aberration flash for heavy hits.
 *
 * The finished frame stays crisp; on top of it we add a red copy shifted right
 * and a cyan copy shifted left ("fringes"). The tinted copies are built at
 * HALF resolution — they are faint and only live for 3 frames, so the blur is
 * invisible and the cost is ~1/4 of a full-res split.
 *
 * Done purely with compositing (multiply / destination-in / lighter), never
 * getImageData, so it works when the frame holds cross-origin pixels.
 * Buffers are allocated on resize only.
 */
const SCALE = 0.5;

export class Aberration {
  private readonly frame = document.createElement('canvas');
  private readonly red = document.createElement('canvas');
  private readonly cyan = document.createElement('canvas');
  private readonly fctx = this.frame.getContext('2d')!;
  private readonly rctx = this.red.getContext('2d')!;
  private readonly cctx = this.cyan.getContext('2d')!;

  resize(pixelW: number, pixelH: number): void {
    for (const c of [this.frame, this.red, this.cyan]) {
      c.width = Math.max(1, Math.round(pixelW * SCALE));
      c.height = Math.max(1, Math.round(pixelH * SCALE));
    }
  }

  private channel(g: CanvasRenderingContext2D, tint: string): void {
    const w = this.frame.width;
    const h = this.frame.height;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.drawImage(this.frame, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in'; // keep the frame's own alpha
    g.drawImage(this.frame, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }

  /**
   * Adds RGB fringes of `offset` device pixels to `ctx`'s canvas. Additive
   * fringes brighten, so light pages use a lower `alpha` to avoid washing out.
   */
  apply(ctx: CanvasRenderingContext2D, offset: number, alpha: number): void {
    const src = ctx.canvas;
    this.fctx.clearRect(0, 0, this.frame.width, this.frame.height);
    this.fctx.drawImage(src, 0, 0, this.frame.width, this.frame.height);
    this.channel(this.rctx, '#ff0000');
    this.channel(this.cctx, '#00ffff');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.red, offset, 0, src.width, src.height);
    ctx.drawImage(this.cyan, -offset, 0, src.width, src.height);
    ctx.restore();
  }
}
