import type { EnemyKind, EnemySpec, Sprite } from '@/shared/types';
import type { Bullets } from '../bullets';
import type { Fx } from '../../engine/fx';
import type { ToxicZones } from './toxic';
import { ARMOR_HP } from '../../dom/armor';
import { drawVideoFrame } from '../../dom/snapshot';
import { TURRET_WARN } from './turret';
import { MONO_FONT, PALETTE, clamp, easeOutBack, easeOutCubic } from '../../engine/render';
import type { Player } from '../player';

/** What enemy behaviours may touch. */
export interface World {
  player: Player;
  bullets: Bullets;
  fx: Fx;
  zones: ToxicZones;
  width: number;
  height: number;
  time: number;
}

export enum State {
  Dormant = 0,
  Waking = 1,
  Active = 2,
  Dead = 3,
}

export const WAKE_TIME = 0.55;

export interface KindStats {
  color: string;
  points: number;
  maxW: number;
  maxH: number;
  hp: (spec: EnemySpec) => number;
  shards: [cols: number, rows: number];
  contactDamage: boolean;
}

const PIXEL_STEPS = [1, 3, 5, 8, 12, 18];
const CHIP_FONT = `800 10px ${MONO_FONT}`;
// Dash patterns allocated once (setLineDash copies, but the literal would allocate every frame).
const DASH_AIM = [6, 6];
const DASH_ANTS = [5, 4];
const DASH_LANE = [10, 7];
const NO_DASH: number[] = [];

let nextId = 1;

function selectorLabel(el: Element | null): string {
  if (!el) return 'div.popup';
  const cls = el.classList[0];
  const label = el.tagName.toLowerCase() + (cls ? `.${cls}` : '');
  return label.length > 24 ? label.slice(0, 23) + '…' : label;
}

export class Enemy {
  readonly id = nextId++;
  readonly kind: EnemyKind;
  readonly sprite: Sprite;
  readonly el: Element | null;
  /** Dev-tools style selector label, e.g. "h2.headline". */
  readonly label: string;
  /** The element's real HTML (truncated) — spills out when it dies. */
  readonly source: string;
  state = State.Dormant;
  /** Centre position. */
  x: number;
  y: number;
  readonly homeX: number;
  readonly homeY: number;
  vx = 0;
  vy = 0;
  readonly w0: number;
  readonly h0: number;
  readonly gw: number;
  readonly gh: number;
  /** Fraction of the snapshot (from its top-left) shown at fighting size. */
  readonly cropW: number;
  readonly cropH: number;
  cw = 1;
  ch = 1;
  w: number;
  h: number;
  hp: number;
  readonly maxHp: number;
  t = 0;
  mode = 0;
  cd = 0;
  flash = 0;
  aim = 0;
  /** World time when the intro inspector picked this element (-1 = not yet). */
  scanT = -1;
  readonly seed = Math.random() * 1000;
  glyphIndex = 0;
  private pixCache: HTMLCanvasElement | null = null;
  private pixTiny: HTMLCanvasElement | null = null;
  /** Cached render bits (computed once, not per frame). */
  private chipWidth = 0;
  private fadeGrad: CanvasGradient | null = null;
  private fadeW = 0;
  /** -1 = pixelation buffers not sized yet. */
  private pixLevel = -1;

  constructor(spec: EnemySpec, readonly stats: KindStats) {
    this.kind = spec.kind;
    this.sprite = spec.sprite;
    this.el = spec.el;
    this.label = selectorLabel(spec.el);
    this.source = spec.el ? spec.el.outerHTML.slice(0, 700) : `<div class="popup">${spec.sprite.text}</div>`;
    this.w0 = this.w = spec.rect.w;
    this.h0 = this.h = spec.rect.h;
    this.x = this.homeX = spec.rect.x + spec.rect.w / 2;
    this.y = this.homeY = spec.rect.y + spec.rect.h / 2;
    // Images scale down; text keeps a legible size and is cropped instead.
    // Live videos fight as a bigger card so you can still watch them play.
    const maxW = spec.sprite.live ? 250 : stats.maxW;
    const maxH = spec.sprite.live ? 180 : stats.maxH;
    let s = Math.min(1, maxW / this.w0, maxH / this.h0);
    if (this.kind === 'swarmer' || this.kind === 'turret') s = 1;
    else if (this.kind === 'tank') s = Math.max(s, 0.5);
    const sw = this.w0 * s;
    const sh = this.h0 * s;
    this.gw = Math.max(18, Math.min(sw, maxW));
    this.gh = Math.max(12, Math.min(sh, maxH));
    this.cropW = Math.min(1, this.gw / sw);
    this.cropH = Math.min(1, this.gh / sh);
    this.maxHp = this.hp = stats.hp(spec) + (spec.sprite.tainted ? ARMOR_HP : 0);
    this.cd = 0.8 + Math.random() * 1.5;
  }

  get alive(): boolean {
    return this.state !== State.Dead;
  }

  get isText(): boolean {
    return this.kind === 'tank' || this.kind === 'swarmer' || this.kind === 'turret';
  }

  /** Cross-origin media: armored, tougher. */
  get armored(): boolean {
    return this.sprite.tainted === true;
  }

  wake(): void {
    if (this.state !== State.Dormant) return;
    this.state = State.Waking;
    this.t = 0;
  }

  tick(dt: number, world: World): boolean {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.state === State.Waking) {
      const k = Math.min(1, this.t / WAKE_TIME);
      const e = easeOutBack(k);
      this.w = this.w0 + (this.gw - this.w0) * e;
      this.h = this.h0 + (this.gh - this.h0) * e;
      this.cw = 1 + (this.cropW - 1) * Math.min(1, e);
      this.ch = 1 + (this.cropH - 1) * Math.min(1, e);
      if (k >= 1) {
        this.state = State.Active;
        this.t = 0;
        this.w = this.gw;
        this.h = this.gh;
        this.cw = this.cropW;
        this.ch = this.cropH;
      }
      return false;
    }
    if (this.state !== State.Active) return false;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const hw = this.w / 2;
    const hh = this.h / 2;
    if (this.x < hw) { this.x = hw; this.vx = Math.abs(this.vx); }
    if (this.x > world.width - hw) { this.x = world.width - hw; this.vx = -Math.abs(this.vx); }
    if (this.y < hh) { this.y = hh; this.vy = Math.abs(this.vy); }
    if (this.y > world.height - hh) { this.y = world.height - hh; this.vy = -Math.abs(this.vy); }
    return true;
  }

  nextGlyph(): string {
    const text = this.sprite.text.replace(/\s+/g, '') || '#';
    const ch = text[this.glyphIndex % text.length] ?? '#';
    this.glyphIndex++;
    return ch;
  }

  private get lift(): number {
    if (this.state === State.Active) return 1;
    if (this.state === State.Waking) return easeOutCubic(Math.min(1, this.t / WAKE_TIME));
    return 0;
  }

  private get charging(): boolean {
    return this.kind === 'brute' && this.mode === 1;
  }

  /** Images rot into bigger and bigger pixels as they take damage. */
  private pixelated(): HTMLCanvasElement {
    const dmg = clamp(1 - Math.max(0, this.hp) / this.maxHp, 0, 1);
    const level = Math.min(PIXEL_STEPS.length - 1, Math.ceil(dmg * (PIXEL_STEPS.length - 1)));
    if (level <= 0) return this.sprite.canvas; // undamaged: draw the snapshot as-is
    // Static media: cached per damage level. Live video: same buffers, redrawn
    // each frame — the canvases are only (re)sized when the level changes.
    if (this.pixCache && this.pixLevel === level && !this.sprite.live) return this.pixCache;
    const src = this.sprite.canvas;
    const tiny = (this.pixTiny ??= document.createElement('canvas'));
    const out = (this.pixCache ??= document.createElement('canvas'));
    if (this.pixLevel !== level) {
      // Block size is in on-screen (fighting size) pixels, so shrunk media still visibly rots.
      const block = PIXEL_STEPS[level]! * (src.width / Math.max(1, this.gw));
      tiny.width = Math.max(1, Math.round(src.width / block));
      tiny.height = Math.max(1, Math.round(src.height / block));
      out.width = src.width;
      out.height = src.height;
      this.pixLevel = level;
    }
    const tg = tiny.getContext('2d')!;
    tg.clearRect(0, 0, tiny.width, tiny.height);
    tg.drawImage(src, 0, 0, tiny.width, tiny.height);
    const g = out.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, out.width, out.height);
    g.drawImage(tiny, 0, 0, out.width, out.height);
    return out;
  }

  /** The canvas a kill should shatter (keeps the damaged look). */
  get deathSprite(): HTMLCanvasElement {
    return this.isText ? this.sprite.canvas : this.pixelated();
  }

  private applyTransform(ctx: CanvasRenderingContext2D): void {
    let jx = 0;
    let jy = 0;
    if (this.charging || this.flash > 0) {
      const a = this.charging ? 3 : 4;
      jx = (Math.random() - 0.5) * a * 2;
      jy = (Math.random() - 0.5) * a * 2;
    }
    ctx.translate(this.x + jx, this.y + jy);
    const lift = this.lift;
    const wobble = this.state === State.Waking ? Math.sin(this.t * 30) * 0.06 * (1 - lift) : 0;
    ctx.rotate(clamp(this.vx / 1600, -0.1, 0.1) + wobble);
    const pop = 1 + this.flash * 1.5;
    ctx.scale(pop, pop);
  }

  render(ctx: CanvasRenderingContext2D, time: number, intro: boolean): void {
    if (this.state === State.Dead) return;
    // Videos keep playing inside their card while they fight you.
    if (this.sprite.live && !this.sprite.live.paused) drawVideoFrame(this.sprite);
    if (this.state === State.Dormant) {
      this.renderDormant(ctx, time, intro);
      return;
    }
    const { w, h } = this;
    const lift = this.lift;
    const off = 2 + lift * 5;

    ctx.save();
    this.applyTransform(ctx);
    const r = 3;
    // Hard ink shadow = the card has been physically pulled off the page.
    ctx.fillStyle = PALETTE.line;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + off, -h / 2 + off, w, h, r);
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.save();
    ctx.clip();
    const src = this.isText ? this.sprite.canvas : this.pixelated();
    const srcW = this.sprite.canvas.width * this.cw;
    const srcH = this.sprite.canvas.height * this.ch;
    if (!this.isText) ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, srcW, srcH, -w / 2, -h / 2, w, h);
    ctx.imageSmoothingEnabled = true;

    if (this.cw < 0.999) {
      // Fade the cut edge; gradient is built once per card width, not per frame.
      const fade = Math.min(30, w * 0.25);
      if (!this.fadeGrad || this.fadeW !== w) {
        this.fadeGrad = ctx.createLinearGradient(w / 2 - fade, 0, w / 2, 0);
        this.fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        this.fadeGrad.addColorStop(1, PALETTE.paper);
        this.fadeW = w;
      }
      ctx.fillStyle = this.fadeGrad;
      ctx.fillRect(w / 2 - fade, -h / 2, fade, h);
    }

    // Damage on text = it gets selected, left to right, like a drag-select.
    if (this.isText && this.hp < this.maxHp) {
      const sel = w * (1 - Math.max(0, this.hp) / this.maxHp);
      ctx.fillStyle = PALETTE.selectSoft;
      ctx.fillRect(-w / 2, -h / 2, sel, h);
      if (Math.floor(time * 3) % 2 === 0) {
        ctx.fillStyle = PALETTE.line;
        ctx.fillRect(-w / 2 + sel - 1, -h / 2 + 2, 2, h - 4);
      }
    }
    if (this.flash > 0) {
      ctx.fillStyle = PALETTE.select;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.restore(); // unclip

    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.line;
    ctx.stroke();
    ctx.restore();

    if (this.state === State.Active) this.renderChip(ctx, this.x - w / 2, this.y - h / 2 - 6);
    if (this.charging) this.renderTelegraph(ctx, time);
    if (this.kind === 'turret' && this.state === State.Active && this.cd < TURRET_WARN) this.renderAim(ctx, time);
  }

  /** Turret about to fire: a blinking dashed aim line toward the player. */
  private renderAim(ctx: CanvasRenderingContext2D, time: number): void {
    if (Math.floor(time * 16) % 2 === 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);
    ctx.strokeStyle = this.stats.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(DASH_AIM);
    ctx.beginPath();
    ctx.moveTo(this.w / 2, 0);
    ctx.lineTo(this.w / 2 + 120, 0);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.restore();
  }

  private renderDormant(ctx: CanvasRenderingContext2D, time: number, intro: boolean): void {
    const { w, h } = this;
    const x = this.x - w / 2;
    const y = this.y - h / 2;
    ctx.drawImage(this.sprite.canvas, x, y, w, h);
    if (this.scanT < 0) return;
    const since = time - this.scanT;

    if (intro && since < 0.7) {
      // Dev-tools "inspect element" highlight.
      ctx.globalAlpha = 0.28 * (1 - since / 0.7) + 0.08;
      ctx.fillStyle = this.stats.color === PALETTE.marker ? '#ffb800' : this.stats.color;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = this.stats.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (since < 0.45) this.renderTooltip(ctx, x, y + h + 6);
      return;
    }
    // Alive but waiting: marching ants.
    ctx.save();
    ctx.setLineDash(DASH_ANTS);
    ctx.lineDashOffset = -time * 24 + this.seed;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PALETTE.line;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    ctx.strokeStyle = this.stats.color;
    ctx.lineDashOffset = -time * 24 + this.seed + 4.5;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    ctx.restore();
  }

  private renderTooltip(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const size = `${Math.round(this.w0)} × ${Math.round(this.h0)}`;
    ctx.font = `700 11px ${MONO_FONT}`;
    const lw = ctx.measureText(this.label).width;
    ctx.font = `500 11px ${MONO_FONT}`;
    const sw = ctx.measureText(size).width;
    const tw = lw + sw + 22;
    const ty = Math.min(y, window.innerHeight - 26);
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.roundRect(x, ty, tw, 20, 3);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `700 11px ${MONO_FONT}`;
    ctx.fillStyle = this.stats.color;
    ctx.fillText(this.label, x + 7, ty + 10.5);
    ctx.font = `500 11px ${MONO_FONT}`;
    ctx.fillStyle = '#b8b8c2';
    ctx.fillText(size, x + lw + 15, ty + 10.5);
  }

  private renderChip(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (this.w < 34) return;
    ctx.font = CHIP_FONT;
    if (this.chipWidth === 0) this.chipWidth = ctx.measureText(this.label).width + 10; // measured once
    const tw = Math.min(this.chipWidth, Math.max(40, this.w));
    ctx.fillStyle = PALETTE.line;
    ctx.fillRect(x + 2, y - 14, tw, 14);
    ctx.fillStyle = this.stats.color;
    ctx.fillRect(x, y - 16, tw, 14);
    ctx.strokeStyle = PALETTE.line;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y - 16, tw, 14);
    ctx.fillStyle = this.stats.color === PALETTE.marker ? PALETTE.ink : PALETTE.white;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (tw >= this.chipWidth) {
      ctx.fillText(this.label, x + 5, y - 8.5);
      return;
    }
    // Only labels wider than the card need clipping.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y - 16, tw - 3, 14);
    ctx.clip();
    ctx.fillText(this.label, x + 5, y - 8.5);
    ctx.restore();
  }

  private renderTelegraph(ctx: CanvasRenderingContext2D, time: number): void {
    const len = 280;
    const lane = Math.min(this.h, 60);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);
    ctx.globalAlpha = 0.16 + (Math.sin(time * 40) > 0 ? 0.1 : 0);
    ctx.fillStyle = PALETTE.error;
    ctx.fillRect(0, -lane / 2, len, lane);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.line;
    ctx.lineWidth = 2;
    ctx.setLineDash(DASH_LANE);
    ctx.lineDashOffset = -time * 140;
    ctx.strokeRect(0, -lane / 2, len, lane);
    ctx.setLineDash(NO_DASH);
    ctx.fillStyle = PALETTE.line;
    for (let i = 1; i <= 3; i++) {
      const ax = (i * len) / 4 + ((time * 160) % (len / 4));
      ctx.beginPath();
      ctx.moveTo(ax, -8);
      ctx.lineTo(ax + 10, 0);
      ctx.lineTo(ax, 8);
      ctx.fill();
    }
    ctx.restore();
  }
}
