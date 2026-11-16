import { PALETTE } from '../../engine/render';
import type { Enemy, KindStats, World } from './enemy';

/**
 * Ads and embeds (iframes, ad slots): slow, tough, and they leave "blocked
 * content" zones on the floor that hurt while you stand in them. Killing them
 * pays the "Ad slayer" bonus.
 */
export const TOXIC: KindStats = {
  color: '#b14dff',
  points: 300,
  maxW: 210,
  maxH: 160,
  hp: () => 9,
  shards: [5, 4],
  contactDamage: true,
};

const MAX_ZONES = 24;
const ZONE_LIFE = 6;
const ZONE_RADIUS = 46;
const DASH_ZONE = [6, 5];
const NO_DASH: number[] = [];

/** Fixed-capacity pool of damage zones (struct of arrays, no allocation). */
export class ToxicZones {
  private readonly x = new Float32Array(MAX_ZONES);
  private readonly y = new Float32Array(MAX_ZONES);
  private readonly r = new Float32Array(MAX_ZONES);
  private readonly life = new Float32Array(MAX_ZONES);
  count = 0;

  spawn(x: number, y: number, r = ZONE_RADIUS): void {
    if (this.count >= MAX_ZONES) return;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.r[i] = r;
    this.life[i] = ZONE_LIFE;
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i]! -= dt;
      if (this.life[i]! > 0) continue;
      const last = --this.count;
      this.x[i] = this.x[last]!;
      this.y[i] = this.y[last]!;
      this.r[i] = this.r[last]!;
      this.life[i] = this.life[last]!;
    }
  }

  /** Is (px,py) inside an active zone? */
  hits(px: number, py: number, pr: number): boolean {
    for (let i = 0; i < this.count; i++) {
      // Zones fade in for 0.5s before they bite, so they are dodgeable.
      if (ZONE_LIFE - this.life[i]! < 0.5) continue;
      const dx = px - this.x[i]!;
      const dy = py - this.y[i]!;
      const rr = this.r[i]! + pr;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  clear(): void {
    this.count = 0;
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    for (let i = 0; i < this.count; i++) {
      const age = ZONE_LIFE - this.life[i]!;
      const grow = Math.min(1, age / 0.5);
      const fade = Math.min(1, this.life[i]! / 0.8);
      const r = this.r[i]! * (0.6 + grow * 0.4);
      const x = this.x[i]!;
      const y = this.y[i]!;
      ctx.globalAlpha = 0.22 * fade;
      ctx.fillStyle = TOXIC.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = (grow < 1 ? 0.5 : 0.95) * fade;
      ctx.strokeStyle = TOXIC.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash(DASH_ZONE);
      ctx.lineDashOffset = -time * 30;
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      // "Blocked content" glyph.
      ctx.strokeStyle = PALETTE.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.moveTo(x - 6.4, y + 6.4);
      ctx.lineTo(x + 6.4, y - 6.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function updateToxic(e: Enemy, dt: number, world: World): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const wob = Math.sin(world.time * 0.9 + e.seed);
  e.vx += ((dx / d) * 45 + (-dy / d) * wob * 35 - e.vx) * Math.min(1, dt * 1.5);
  e.vy += ((dy / d) * 45 + (dx / d) * wob * 35 - e.vy) * Math.min(1, dt * 1.5);
  e.cd -= dt;
  if (e.cd <= 0) {
    e.cd = 2.2 + Math.random() * 1.2;
    world.zones.spawn(e.x, e.y + e.h / 2);
  }
}
