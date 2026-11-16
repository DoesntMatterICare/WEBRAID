import type { EnemyKind } from '@/shared/types';

/** Points per kill before the combo multiplier (PROJECT.md §2 Scoring). */
export const KILL_POINTS: Record<EnemyKind | 'boss', number> = {
  swarmer: 50,
  turret: 120,
  brute: 150,
  tank: 250,
  toxic: 300,
  boss: 5000,
};

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

export interface Bonus {
  label: string;
  points: number;
}

/** One line of the battle receipt. */
export interface ReceiptLine {
  kind: EnemyKind | 'boss';
  count: number;
  points: number;
}

/**
 * Score, combo, accuracy, timer and rank for one raid. Kept out of game.ts so
 * the HUD, end screen and share card all read the same numbers.
 */
export class Scoring {
  score = 0;
  combo = 0;
  bestCombo = 0;
  kills = 0;
  shots = 0;
  hits = 0;
  damageTaken = 0;
  /** Seconds of actual play (intro and freeze-frames excluded). */
  time = 0;
  adsSlain = 0;
  bossDefeated = false;
  private readonly perKind = new Map<EnemyKind | 'boss', ReceiptLine>();

  get multiplier(): number {
    return 1 + Math.min(4, this.combo * 0.1);
  }

  get accuracy(): number {
    return this.shots ? this.hits / this.shots : 0;
  }

  tick(dt: number): void {
    this.time += dt;
  }

  shot(): void {
    this.shots++;
  }

  hit(): void {
    this.hits++;
  }

  /** Register a kill; returns the points it was worth. */
  kill(kind: EnemyKind | 'boss'): number {
    this.kills++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (kind === 'toxic') this.adsSlain++;
    if (kind === 'boss') this.bossDefeated = true;
    const pts = Math.round(KILL_POINTS[kind] * this.multiplier);
    this.score += pts;
    let line = this.perKind.get(kind);
    if (!line) {
      line = { kind, count: 0, points: 0 };
      this.perKind.set(kind, line);
    }
    line.count++;
    line.points += pts;
    return pts;
  }

  /** Player took damage: combo breaks. */
  hurt(): void {
    this.combo = 0;
    this.damageTaken++;
  }

  /** End-of-raid bonuses; adds them to the score and returns them. */
  settle(victory: boolean): Bonus[] {
    const bonuses: Bonus[] = [];
    if (victory) {
      if (this.damageTaken === 0) bonuses.push({ label: 'No damage', points: 2000 });
      const speed = Math.max(0, Math.round(3000 - this.time * 15));
      if (speed > 0) bonuses.push({ label: 'Speed clear', points: speed });
      if (this.accuracy >= 0.75) bonuses.push({ label: 'Sharpshooter', points: 1000 });
    }
    if (this.adsSlain > 0) bonuses.push({ label: 'Ad slayer', points: this.adsSlain * 250 });
    for (const b of bonuses) this.score += b.points;
    return bonuses;
  }

  rank(victory: boolean): Rank {
    if (!victory) return 'D';
    if (this.damageTaken === 0 && this.accuracy >= 0.4) return 'S';
    if (this.damageTaken <= 1) return 'A';
    if (this.damageTaken <= 3) return 'B';
    return 'C';
  }

  receipt(): ReceiptLine[] {
    return [...this.perKind.values()].sort((a, b) => b.points - a.points);
  }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
