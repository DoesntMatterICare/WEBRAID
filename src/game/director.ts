import { State, type Enemy } from './entities/enemies';

const KIND_ORDER = { swarmer: 0, turret: 0.6, brute: 1, toxic: 1.4, tank: 2 } as const;
const WAVE_TIMEOUT = 13;

/**
 * Wakes the page up in waves: links first, then buttons and images, then ads
 * and headings. When every wave is cleared the game raises the boss.
 * Allocation-free per frame: the queue is consumed through a cursor.
 */
export class Director {
  wave = 0;
  readonly totalWaves: number;
  private readonly queue: Enemy[];
  private cursor = 0;
  private timer = 0;

  constructor(private readonly enemies: Enemy[]) {
    this.queue = [...enemies].sort(
      (a, b) => KIND_ORDER[a.kind] + Math.random() * 1.6 - (KIND_ORDER[b.kind] + Math.random() * 1.6),
    );
    let n = 0;
    let waves = 0;
    while (n < this.queue.length) n += this.waveSize(waves++);
    this.totalWaves = Math.max(1, waves);
  }

  private waveSize(wave: number): number {
    return Math.min(18, 6 + wave * 2);
  }

  /** Enemies that are awake and fighting (or waking up). */
  activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const s = this.enemies[i]!.state;
      if (s === State.Active || s === State.Waking) n++;
    }
    return n;
  }

  /** Every regular enemy (including boss-summoned minions) is dead. */
  get finished(): boolean {
    for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i]!.state !== State.Dead) return false;
    return true;
  }

  update(dt: number): boolean {
    this.timer -= dt;
    // Skip enemies the player already woke early by shooting them.
    while (this.cursor < this.queue.length && this.queue[this.cursor]!.state !== State.Dormant) this.cursor++;
    if (this.cursor >= this.queue.length) return false;
    if (this.wave > 0 && this.activeCount() > 2 && this.timer > 0) return false;

    let woken = 0;
    const size = this.waveSize(this.wave);
    while (woken < size && this.cursor < this.queue.length) {
      const e = this.queue[this.cursor++]!;
      if (e.state !== State.Dormant) continue;
      e.wake();
      woken++;
    }
    this.wave = Math.min(this.totalWaves, this.wave + 1);
    this.timer = WAVE_TIMEOUT;
    return true;
  }
}
