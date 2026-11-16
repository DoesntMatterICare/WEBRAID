import { Owner } from '../bullets';
import type { Enemy, KindStats, World } from './enemy';

/** Headings: slow, tough, fire fans of letter-bullets made from their own text. */
export const TANK: KindStats = {
  color: '#ffe14d',
  points: 250,
  maxW: 300,
  maxH: 90,
  hp: (spec) => Math.min(30, 12 + Math.floor(spec.sprite.text.length / 4)),
  shards: [8, 3],
  contactDamage: true,
};

const PREFERRED_DIST = 240;

export function updateTank(e: Enemy, dt: number, world: World): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  // Approach to a comfortable range, then strafe.
  const toward = d > PREFERRED_DIST ? 1 : d < PREFERRED_DIST - 60 ? -1 : 0;
  const strafe = Math.sin(world.time * 0.7 + e.seed);
  const tx = (dx / d) * toward * 50 + (-dy / d) * strafe * 30;
  const ty = (dy / d) * toward * 50 + (dx / d) * strafe * 30;
  e.vx += (tx - e.vx) * Math.min(1, dt * 2);
  e.vy += (ty - e.vy) * Math.min(1, dt * 2);

  e.cd -= dt;
  if (e.cd <= 0) {
    e.cd = 1.7 + Math.random() * 0.8;
    const base = Math.atan2(dy, dx);
    for (let i = -1; i <= 1; i++) {
      world.bullets.fire(Owner.Enemy, e.x, e.y, base + i * 0.24, 200, {
        r: 7,
        color: TANK.color,
        glyph: e.nextGlyph(),
        life: 5,
      });
    }
  }
}
