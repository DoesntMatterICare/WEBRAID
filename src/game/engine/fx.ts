import { Pool } from './pool';
import { MONO_FONT, PALETTE, reducedMotion } from './render';
import { ShardSystem } from './shards';
import { glyphSprite } from './sprite-cache';
import { applyWorld, place } from './xform';

export enum PType {
  /** Square chip (pixels, paper confetti). */
  Bit = 0,
  /** Motion streak. */
  Spark = 1,
  /** Expanding outline ring. */
  Ring = 3,
  /** Floating label. */
  Text = 4,
  /** Falling source-code character. */
  Glyph = 5,
}

interface Particle {
  type: PType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  /** Ring stroke width; label box width cache. */
  aux: number;
  color: string;
  rot: number;
  vr: number;
  drag: number;
  gravity: number;
  text: string;
  /** Pre-built CSS font string (no per-frame string building). */
  font: string;
  /** Pre-rendered glyph (looked up at spawn, drawn with one drawImage). */
  sprite: HTMLCanvasElement | null;
}

function blank(): Particle {
  return {
    type: PType.Bit, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, aux: 0, color: '#000',
    rot: 0, vr: 0, drag: 2, gravity: 0, text: '', font: '', sprite: null,
  };
}

const TAU = Math.PI * 2;
/** Hard cap for non-shard particles (sparks, bits, glyphs, rings, labels). */
export const MAX_PARTICLES = 1000;
/** Minimum seconds between aberration bursts, so mass kills don't chain them. */
const ABERRATION_COOLDOWN = 0.35;

// Font strings by pixel size, built once.
const GLYPH_FONTS: string[] = [];
const LABEL_FONTS: string[] = [];
for (let s = 0; s <= 40; s++) {
  GLYPH_FONTS.push(`700 ${s}px ${MONO_FONT}`);
  LABEL_FONTS.push(`800 ${s}px ${MONO_FONT}`);
}
const fontAt = (table: string[], size: number): string => table[Math.max(0, Math.min(40, Math.round(size)))]!;

/** Smooth pseudo-noise in [-1,1] for camera shake (no allocation, no RNG jitter). */
function noise(t: number, seed: number): number {
  return (Math.sin(t * 37.1 + seed) + Math.sin(t * 23.7 + seed * 1.7) * 0.6 + Math.sin(t * 61.3 + seed * 2.3) * 0.3) / 1.9;
}

/**
 * Particles, shards, shockwave rings, labels, camera shake (positional +
 * rotational + directional kick), flashes, chromatic-aberration trigger and
 * hit-stop.
 */
export class Fx {
  readonly shards = new ShardSystem();
  private readonly particles = new Pool<Particle>(blank, MAX_PARTICLES, 400);

  // Camera.
  private trauma = 0;
  private clock = 0;
  private kickX = 0;
  private kickY = 0;
  shakeX = 0;
  shakeY = 0;
  /** Camera roll in radians. */
  shakeRot = 0;

  flash = 0;
  flashColor = '#ffffff';
  /** Red edge pulse when the player is hurt. */
  hurt = 0;
  /** Remaining freeze-frame time. */
  hitStop = 0;
  /** Rendered frames of chromatic aberration left (counted per frame, not per update). */
  aberration = 0;
  private aberrationCd = 0;

  get particleCount(): number {
    return this.particles.active.length;
  }

  private spawn(type: PType, x: number, y: number, life: number): Particle | null {
    const p = this.particles.obtain();
    if (!p) return null; // pool exhausted: drop the effect, never allocate
    p.type = type;
    p.x = x;
    p.y = y;
    p.vx = p.vy = 0;
    p.maxLife = p.life = life;
    p.rot = p.vr = 0;
    p.drag = 2;
    p.gravity = 0;
    return p;
  }

  /**
   * Add camera trauma. Pass the impact direction (any length) to also kick the
   * camera that way — hits feel like they come *from* somewhere.
   */
  shake(amount: number, dirX = 0, dirY = 0): void {
    const k = reducedMotion ? 0.3 : 1;
    this.trauma = Math.min(1, this.trauma + amount * k);
    const d = Math.hypot(dirX, dirY);
    if (d > 0) {
      this.kickX += (dirX / d) * amount * 22 * k;
      this.kickY += (dirY / d) * amount * 22 * k;
    }
  }

  freeze(seconds: number): void {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  doFlash(strength: number, color = '#ffffff'): void {
    this.flash = Math.max(this.flash, strength);
    this.flashColor = color;
  }

  /** 3-frame RGB split on heavy hits. */
  aberrate(): void {
    if (reducedMotion || this.aberrationCd > 0) return;
    this.aberration = 3;
    this.aberrationCd = ABERRATION_COOLDOWN;
  }

  bits(x: number, y: number, color: string, count: number, speed: number, size = 4): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn(PType.Bit, x, y, 0.5 + Math.random() * 0.6);
      if (!p) return;
      const a = Math.random() * TAU;
      const s = speed * (0.25 + Math.random() * 0.75);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s - speed * 0.3;
      p.size = size * (0.5 + Math.random() * 0.8);
      p.color = color;
      p.gravity = 900;
      p.drag = 1.5;
      p.vr = (Math.random() - 0.5) * 16;
    }
  }

  sparks(x: number, y: number, color: string, count: number, speed: number, dir = 0, spread = TAU): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn(PType.Spark, x, y, 0.16 + Math.random() * 0.22);
      if (!p) return;
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.size = 1.5 + Math.random() * 1.5;
      p.color = color;
      p.drag = 6;
    }
  }

  ring(x: number, y: number, color: string, radius: number, life = 0.4, width = 3): void {
    const p = this.spawn(PType.Ring, x, y, life);
    if (!p) return;
    p.size = radius;
    p.aux = width;
    p.color = color;
  }

  /** Label that floats up: score popups, "404", "TAB CLOSED". */
  popup(x: number, y: number, text: string, color: string, size = 14): void {
    const p = this.spawn(PType.Text, x, y, 0.95);
    if (!p) return;
    p.vy = -80;
    p.vx = (Math.random() - 0.5) * 30;
    p.text = text;
    p.color = color;
    p.size = size;
    p.font = fontAt(LABEL_FONTS, size);
    p.aux = 0; // box width, measured on first draw
    p.drag = 2.5;
  }

  /** The element's own HTML source spills out as falling characters. */
  glyphs(x: number, y: number, w: number, source: string, count: number): void {
    const chars = source.replace(/\s+/g, '');
    if (!chars) return;
    const start = Math.floor(Math.random() * Math.max(1, chars.length - count));
    for (let i = 0; i < count; i++) {
      const ch = chars[(start + i) % chars.length]!;
      const p = this.spawn(PType.Glyph, x + (Math.random() - 0.5) * w, y, 0.9 + Math.random() * 0.8);
      if (!p) return;
      p.text = ch;
      p.vx = (Math.random() - 0.5) * 260;
      p.vy = -120 - Math.random() * 260;
      p.gravity = 1000;
      p.drag = 0.8;
      p.vr = (Math.random() - 0.5) * 10;
      p.size = 11 + Math.random() * 6;
      p.font = fontAt(GLYPH_FONTS, p.size);
      p.color = ch === '<' || ch === '>' || ch === '/' ? PALETTE.error : PALETTE.line;
      p.sprite = glyphSprite(ch, p.color, p.size);
    }
  }

  /** Slice a sprite into pre-baked polygon shards (see shards.ts). */
  shatter(
    sprite: HTMLCanvasElement,
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
    this.shards.edgeColor = PALETTE.line;
    this.shards.shatter(sprite, cx, cy, w, h, cols, rows, force, cropW, cropH);
  }

  update(dt: number): void {
    this.shards.update(dt);
    const list = this.particles.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.releaseAt(i);
        continue;
      }
      p.vy += p.gravity * dt;
      const k = 1 - Math.min(1, p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  /** Camera effects; keeps running during hit-stop so freezes still shake. */
  updateCamera(dt: number): void {
    this.clock += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const t = this.trauma * this.trauma;
    const spring = 1 - Math.min(1, dt * 12);
    this.kickX *= spring;
    this.kickY *= spring;
    this.shakeX = noise(this.clock, 1.3) * t * 16 + this.kickX;
    this.shakeY = noise(this.clock, 7.9) * t * 16 + this.kickY;
    this.shakeRot = reducedMotion ? 0 : noise(this.clock, 4.2) * t * 0.05;
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    this.aberrationCd = Math.max(0, this.aberrationCd - dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.shards.render(ctx);
    ctx.lineCap = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const list = this.particles.active;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const t = p.life / p.maxLife;
      switch (p.type) {
        case PType.Bit:
          ctx.globalAlpha = Math.min(1, t * 2);
          place(ctx, p.x, p.y, p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          applyWorld(ctx);
          break;
        case PType.Spark:
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          break;
        case PType.Ring: {
          const e = 1 - t * t * t;
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.aux * t + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 + p.size * e, 0, TAU);
          ctx.stroke();
          break;
        }
        case PType.Glyph:
          if (!p.sprite) break;
          ctx.globalAlpha = Math.min(1, t * 2);
          place(ctx, p.x, p.y, p.rot);
          ctx.drawImage(p.sprite, -p.sprite.width / 2, -p.sprite.height / 2);
          applyWorld(ctx);
          break;
        default:
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Labels, drawn last so they are always readable. */
  renderText(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const list = this.particles.active;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (p.type !== PType.Text) continue;
      const t = p.life / p.maxLife;
      const pop = t > 0.85 ? 1 + (t - 0.85) * 4 : 1;
      ctx.globalAlpha = Math.min(1, t * 2.5);
      ctx.font = p.font;
      if (p.aux === 0) p.aux = ctx.measureText(p.text).width + 10;
      const w = p.aux * pop;
      const h = (p.size + 6) * pop;
      ctx.fillStyle = PALETTE.line;
      ctx.fillRect(p.x - w / 2 + 2, p.y - h / 2 + 2, w, h);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      ctx.fillStyle = p.color === PALETTE.marker || p.color === PALETTE.white ? PALETTE.ink : PALETTE.white;
      ctx.fillText(p.text, p.x, p.y + 1);
    }
    ctx.globalAlpha = 1;
  }

  renderScreen(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.hurt > 0) {
      const b = 18 * this.hurt;
      ctx.fillStyle = PALETTE.error;
      ctx.globalAlpha = Math.min(1, this.hurt);
      ctx.fillRect(0, 0, w, b);
      ctx.fillRect(0, h - b, w, b);
      ctx.fillRect(0, 0, b, h);
      ctx.fillRect(w - b, 0, b, h);
      ctx.globalAlpha = 1;
    }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.7, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
}
