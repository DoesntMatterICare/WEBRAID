import { Pool } from '../engine/pool';
import { PALETTE } from '../engine/render';
import { orbSprite } from '../engine/sprite-cache';
import { applyWorld, place } from '../engine/xform';

export enum Owner {
  Player = 0,
  Enemy = 1,
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
  owner: Owner;
  damage: number;
  color: string;
  /** Enemy letter-bullet glyph (tanks fire their own text). */
  glyph: string;
  /** Pre-rendered orb for enemy bullets (looked up at fire time). */
  sprite: HTMLCanvasElement | null;
  /** Heading of a player caret, computed at fire time. */
  angle: number;
}

function blank(): Bullet {
  return { x: 0, y: 0, vx: 0, vy: 0, r: 4, life: 0, age: 0, owner: Owner.Player, damage: 1, color: '#000', glyph: '', sprite: null, angle: 0 };
}

/** Hard cap on live bullets (PROJECT.md §4: 500 on screen at 60 FPS). */
export const MAX_BULLETS = 900;

export class Bullets {
  readonly pool = new Pool<Bullet>(blank, MAX_BULLETS, 300);

  fire(
    owner: Owner,
    x: number,
    y: number,
    angle: number,
    speed: number,
    opts: { r?: number; damage?: number; color?: string; glyph?: string; life?: number } = {},
  ): void {
    const b = this.pool.obtain();
    if (!b) return; // pool full: the shot is dropped, nothing is allocated
    b.owner = owner;
    b.x = x;
    b.y = y;
    b.angle = angle;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.r = opts.r ?? 4;
    b.damage = opts.damage ?? 1;
    b.color = opts.color ?? PALETTE.select;
    b.glyph = opts.glyph ?? '';
    b.life = opts.life ?? 3;
    b.age = 0;
    b.sprite = owner === Owner.Enemy ? orbSprite(b.glyph, b.color, PALETTE.line, PALETTE.ink, b.r) : null;
  }

  update(dt: number, w: number, h: number): void {
    const list = this.pool.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.age += dt;
      if (b.life <= 0 || b.x < -40 || b.y < -40 || b.x > w + 40 || b.y > h + 40) this.pool.releaseAt(i);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const list = this.pool.active;
    // Enemy orbs: one drawImage each, no transform changes.
    for (let i = 0; i < list.length; i++) {
      const b = list[i]!;
      if (b.owner !== Owner.Enemy || !b.sprite) continue;
      ctx.drawImage(b.sprite, b.x - b.sprite.width / 2, b.y - b.sprite.height / 2);
    }
    // Player carets: a text cursor dragging a selection highlight behind it.
    for (let i = 0; i < list.length; i++) {
      const b = list[i]!;
      if (b.owner !== Owner.Player) continue;
      const len = Math.min(30, 8 + b.age * 500);
      place(ctx, b.x, b.y, b.angle);
      ctx.fillStyle = PALETTE.selectSoft;
      ctx.fillRect(-len, -5, len, 10);
      ctx.fillStyle = PALETTE.line;
      ctx.fillRect(-1.5, -7, 3, 14);
      ctx.fillRect(-4, -7, 8, 2);
      ctx.fillRect(-4, 5, 8, 2);
    }
    applyWorld(ctx);
  }
}
