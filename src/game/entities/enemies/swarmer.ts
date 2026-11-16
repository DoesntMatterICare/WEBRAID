import type { Enemy, KindStats, World } from './enemy';

/** Links: small, fast, come at you in groups. */
export const SWARMER: KindStats = {
  color: '#2a3cff',
  points: 50,
  maxW: 170,
  maxH: 34,
  hp: () => 2,
  shards: [4, 1],
  contactDamage: true,
};

export function updateSwarmer(e: Enemy, dt: number, world: World): void {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  // Seek with a per-enemy sideways weave so the swarm spreads out instead of stacking.
  const weave = Math.sin(world.time * 3 + e.seed) * 0.8;
  const speed = 175 + (e.seed % 40);
  const tx = (dx / d) * speed + (-dy / d) * weave * speed;
  const ty = (dy / d) * speed + (dx / d) * weave * speed;
  e.vx += (tx - e.vx) * Math.min(1, dt * 2.5);
  e.vy += (ty - e.vy) * Math.min(1, dt * 2.5);
}
