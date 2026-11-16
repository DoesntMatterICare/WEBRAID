import { Owner } from '../bullets';
import type { Enemy, KindStats, World } from './enemy';

/**
 * Buttons: stay near where they were on the page and fire aimed shots.
 * App-style sites (NotebookLM, Gmail-likes, dashboards) are mostly buttons,
 * so this is what makes them come alive.
 */
export const TURRET: KindStats = {
  color: '#13b26b',
  points: 120,
  maxW: 220,
  maxH: 48,
  hp: () => 4,
  shards: [5, 2],
  contactDamage: true,
};

/** Seconds of warning (aim line) before each shot. */
export const TURRET_WARN = 0.45;

export function updateTurret(e: Enemy, dt: number, world: World): void {
  const p = world.player;
  // Hover around the original spot with a small bob, like a button lifted off the page.
  const tx = e.homeX + Math.sin(world.time * 1.3 + e.seed) * 18;
  const ty = e.homeY + Math.cos(world.time * 1.1 + e.seed) * 10;
  e.vx += ((tx - e.x) * 3 - e.vx) * Math.min(1, dt * 4);
  e.vy += ((ty - e.y) * 3 - e.vy) * Math.min(1, dt * 4);
  e.aim = Math.atan2(p.y - e.y, p.x - e.x);

  e.cd -= dt;
  if (e.cd <= 0) {
    e.cd = 1.5 + Math.random() * 1.2;
    world.bullets.fire(Owner.Enemy, e.x, e.y, e.aim, 280, { r: 5, color: TURRET.color, life: 4 });
  }
}
