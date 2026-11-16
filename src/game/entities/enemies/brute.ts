import type { Enemy, KindStats, World } from './enemy';

/** Images & videos: wander, wind up, then charge. Shatter into pixel shards on death. */
export const BRUTE: KindStats = {
  color: '#ff3131',
  points: 150,
  maxW: 150,
  maxH: 150,
  hp: (spec) => Math.min(14, 6 + Math.floor((spec.rect.w * spec.rect.h) / 20000)),
  shards: [6, 6],
  contactDamage: true,
};

const enum Mode {
  Roam = 0,
  WindUp = 1,
  Charge = 2,
}

export function updateBrute(e: Enemy, dt: number, world: World): void {
  const p = world.player;
  e.cd -= dt;
  switch (e.mode as Mode) {
    case Mode.Roam: {
      const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(world.time + e.seed) * 0.9;
      e.vx += (Math.cos(a) * 70 - e.vx) * Math.min(1, dt * 3);
      e.vy += (Math.sin(a) * 70 - e.vy) * Math.min(1, dt * 3);
      if (e.cd <= 0) {
        e.mode = Mode.WindUp;
        e.cd = 0.55;
      }
      break;
    }
    case Mode.WindUp:
      e.vx *= 1 - Math.min(1, dt * 10);
      e.vy *= 1 - Math.min(1, dt * 10);
      e.aim = Math.atan2(p.y - e.y, p.x - e.x); // locks in when the charge starts
      if (e.cd <= 0) {
        e.mode = Mode.Charge;
        e.cd = 0.65;
        e.vx = Math.cos(e.aim) * 560;
        e.vy = Math.sin(e.aim) * 560;
      }
      break;
    case Mode.Charge:
      if (e.cd <= 0) {
        e.mode = Mode.Roam;
        e.cd = 1.4 + Math.random() * 1.2;
        e.vx *= 0.2;
        e.vy *= 0.2;
      }
      break;
  }
}
