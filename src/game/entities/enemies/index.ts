import type { EnemyKind, EnemySpec } from '@/shared/types';
import { BRUTE, updateBrute } from './brute';
import { Enemy, type KindStats, type World } from './enemy';
import { SWARMER, updateSwarmer } from './swarmer';
import { TANK, updateTank } from './tank';
import { TOXIC, updateToxic } from './toxic';
import { TURRET, updateTurret } from './turret';

export { Enemy, State, type World } from './enemy';
export { ToxicZones } from './toxic';
export { TURRET_WARN } from './turret';

const KINDS: Record<EnemyKind, { stats: KindStats; update: (e: Enemy, dt: number, w: World) => void }> = {
  tank: { stats: TANK, update: updateTank },
  brute: { stats: BRUTE, update: updateBrute },
  swarmer: { stats: SWARMER, update: updateSwarmer },
  turret: { stats: TURRET, update: updateTurret },
  toxic: { stats: TOXIC, update: updateToxic },
};

export function createEnemy(spec: EnemySpec): Enemy {
  return new Enemy(spec, KINDS[spec.kind].stats);
}

export function updateEnemy(e: Enemy, dt: number, world: World): void {
  if (e.tick(dt, world)) KINDS[e.kind].update(e, dt, world);
}
