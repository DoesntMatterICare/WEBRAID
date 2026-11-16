import type { BossTarget } from '../dom/boss-finder';
import { MONO_FONT, PALETTE, clamp, easeOutBack } from '../engine/render';
import { Owner } from './bullets';
import type { World } from './enemies';

export enum BossState {
  Hidden = 0,
  Rising = 1,
  Active = 2,
  Dead = 3,
}

const RISE_TIME = 1.4;
const CRACK_SEGMENTS = 48;

type Pattern = 'spiral' | 'fan' | 'burst';
const PATTERNS: Pattern[] = ['spiral', 'fan', 'burst'];

/** Offline phase taunts (AI taunts arrive with the v0.3 backend). */
const TAUNTS: Record<1 | 2 | 3, string[]> = {
  1: ['{site} has entered the chat.', 'You clicked. You regret.', 'Cookies? I’ll take ALL of them.'],
  2: ['Loading reinforcements… 99%', 'Have you tried turning me off and on?', 'My links have links.'],
  3: ['ERR_TOO_MANY_HITS', 'I am the algorithm now.', 'Fine. Infinite scroll it is.'],
};

/**
 * The site logo as the final boss (PROJECT.md §2):
 *  Phase 1 (100–60%): spiral, fan and aimed-burst bullet patterns.
 *  Phase 2 (60–25%): also summons minions from leftover page elements.
 *  Phase 3 (25–0%): enraged — faster, denser, the camera never settles.
 */
export class Boss {
  readonly name: string;
  readonly target: BossTarget;
  state = BossState.Hidden;
  x: number;
  y: number;
  w: number;
  h: number;
  private readonly homeX: number;
  private readonly homeY: number;
  private readonly gw: number;
  private readonly gh: number;
  hp: number;
  readonly maxHp: number;
  phase: 1 | 2 | 3 = 1;
  /** Set for one update when the phase changes, so the game can react. */
  phaseChanged = false;
  flash = 0;
  private t = 0;
  private cd = 1.2;
  private patternIndex = 0;
  private patternT = 0;
  private spin = 0;
  private burstLeft = 0;
  private summonCd = 2;
  taunt = '';
  private tauntT = 0;
  private tauntW = 0;
  // Pre-generated crack polyline in card-normalised coordinates (no per-frame allocation).
  private readonly crack = new Float32Array(CRACK_SEGMENTS * 2 + 2);

  constructor(target: BossTarget, siteLabel: string, enemyCount: number) {
    this.target = target;
    const word = siteLabel.split('.')[0]!.replace(/[^a-z0-9]/gi, ' ').trim().toUpperCase() || 'PAGE';
    this.name = `THE ${word.slice(0, 18)} OVERLORD`;
    this.w = target.rect.w;
    this.h = target.rect.h;
    this.x = this.homeX = target.rect.x + target.rect.w / 2;
    this.y = this.homeY = target.rect.y + target.rect.h / 2;
    // Logos are often tiny: scale them UP to boss size, keeping aspect.
    const s = clamp(Math.min(300 / this.w, 190 / this.h), 0.4, 5);
    this.gw = Math.max(160, this.w * s);
    this.gh = Math.max(60, this.h * s);
    this.maxHp = this.hp = 60 + Math.min(80, enemyCount);
    let px = 0.5;
    let py = 0.5;
    this.crack[0] = px;
    this.crack[1] = py;
    let a = Math.random() * Math.PI * 2;
    for (let i = 1; i <= CRACK_SEGMENTS; i++) {
      if (i % 8 === 0) {
        px = 0.5;
        py = 0.5;
        a = Math.random() * Math.PI * 2;
      }
      a += (Math.random() - 0.5) * 1.1;
      px = clamp(px + Math.cos(a) * 0.08, 0.02, 0.98);
      py = clamp(py + Math.sin(a) * 0.14, 0.04, 0.96);
      this.crack[i * 2] = px;
      this.crack[i * 2 + 1] = py;
    }
  }

  get alive(): boolean {
    return this.state === BossState.Rising || this.state === BossState.Active;
  }

  get fraction(): number {
    return Math.max(0, this.hp) / this.maxHp;
  }

  rise(): void {
    if (this.state !== BossState.Hidden) return;
    this.state = BossState.Rising;
    this.t = 0;
    this.say(1);
  }

  private say(phase: 1 | 2 | 3): void {
    const list = TAUNTS[phase];
    this.taunt = list[Math.floor(Math.random() * list.length)]!.replace('{site}', this.name.replace(/^THE | OVERLORD$/g, ''));
    this.tauntT = 2.8;
    this.tauntW = 0;
  }

  /** Returns true when the boss dies from this hit. */
  damage(amount: number): boolean {
    if (this.state !== BossState.Active) return false;
    this.hp -= amount;
    this.flash = 0.06;
    const f = this.fraction;
    const next: 1 | 2 | 3 = f > 0.6 ? 1 : f > 0.25 ? 2 : 3;
    if (next !== this.phase) {
      this.phase = next;
      this.phaseChanged = true;
      this.say(next);
    }
    if (this.hp <= 0) {
      this.state = BossState.Dead;
      return true;
    }
    return false;
  }

  /** `summon` wakes one leftover page element as a minion; returns false when none are left. */
  update(dt: number, world: World, summon: (x: number, y: number) => boolean): void {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.tauntT = Math.max(0, this.tauntT - dt);
    const tx = world.width / 2;
    const ty = Math.max(this.gh / 2 + 70, world.height * 0.26);

    if (this.state === BossState.Rising) {
      const k = Math.min(1, this.t / RISE_TIME);
      const e = easeOutBack(k);
      this.x = this.homeX + (tx - this.homeX) * e;
      this.y = this.homeY + (ty - this.homeY) * e;
      this.w = this.target.rect.w + (this.gw - this.target.rect.w) * e;
      this.h = this.target.rect.h + (this.gh - this.target.rect.h) * e;
      if (k >= 1) {
        this.state = BossState.Active;
        this.t = 0;
      }
      return;
    }
    if (this.state !== BossState.Active) return;

    const rage = this.phase === 3 ? 1.55 : this.phase === 2 ? 1.2 : 1;
    this.x = tx + Math.sin(this.t * 0.55 * rage) * Math.min(world.width * 0.3, 320);
    this.y = ty + Math.sin(this.t * 0.9) * 18;
    if (this.phase === 3) world.fx.shake(0.012);

    if (this.phase >= 2) {
      this.summonCd -= dt;
      if (this.summonCd <= 0) {
        this.summonCd = this.phase === 3 ? 2.6 : 3.6;
        summon(this.x - this.w / 2, this.y + this.h / 2);
        summon(this.x + this.w / 2, this.y + this.h / 2);
      }
    }

    this.cd -= dt * rage;
    if (this.cd > 0) return;
    const pattern = PATTERNS[this.patternIndex % PATTERNS.length]!;
    this.patternT += 1;
    const p = world.player;
    const aim = Math.atan2(p.y - this.y, p.x - this.x);
    const speed = 210 * (this.phase === 3 ? 1.3 : 1);
    switch (pattern) {
      case 'spiral': {
        const arms = this.phase === 3 ? 4 : this.phase === 2 ? 3 : 2;
        for (let i = 0; i < arms; i++) {
          world.bullets.fire(Owner.Enemy, this.x, this.y, this.spin + (i * Math.PI * 2) / arms, speed * 0.85, { r: 5, color: PALETTE.error, life: 5 });
        }
        this.spin += 0.33;
        this.cd = 0.09;
        if (this.patternT >= 26) this.nextPattern();
        break;
      }
      case 'fan': {
        const n = this.phase === 3 ? 11 : 9;
        for (let i = 0; i < n; i++) {
          world.bullets.fire(Owner.Enemy, this.x, this.y + this.h / 2, aim + (i / (n - 1) - 0.5) * 1.3, speed, { r: 6, color: PALETTE.marker, glyph: this.name[(i + this.patternT) % this.name.length] === ' ' ? '#' : this.name[(i + this.patternT) % this.name.length]!, life: 5 });
        }
        this.cd = 0.85;
        if (this.patternT >= 3) this.nextPattern();
        break;
      }
      case 'burst':
        if (this.burstLeft === 0) this.burstLeft = this.phase === 3 ? 8 : 5;
        world.bullets.fire(Owner.Enemy, this.x, this.y, aim, speed * 1.35, { r: 5, color: PALETTE.error, life: 4 });
        this.burstLeft--;
        this.cd = 0.13;
        if (this.burstLeft === 0) this.nextPattern();
        break;
    }
  }

  private nextPattern(): void {
    this.patternIndex++;
    this.patternT = 0;
    this.burstLeft = 0;
    this.cd = this.phase === 3 ? 0.5 : 0.9;
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.state === BossState.Hidden || this.state === BossState.Dead) return;
    const { w, h } = this;
    let jx = 0;
    let jy = 0;
    if (this.phase === 3 || this.flash > 0) {
      jx = (Math.random() - 0.5) * 4;
      jy = (Math.random() - 0.5) * 4;
    }
    ctx.save();
    ctx.translate(this.x + jx, this.y + jy);
    ctx.rotate(Math.sin(time * 0.8) * 0.03);
    ctx.fillStyle = PALETTE.line;
    ctx.fillRect(-w / 2 + 8, -h / 2 + 8, w, h);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    const src = this.target.sprite.canvas;
    ctx.drawImage(src, 0, 0, src.width, src.height, -w / 2, -h / 2, w, h);

    // Damage cracks spread across the logo as it loses health.
    const segs = Math.floor((1 - this.fraction) * CRACK_SEGMENTS);
    if (segs > 0) {
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const cx = -w / 2 + this.crack[i * 2]! * w;
        const cy = -h / 2 + this.crack[i * 2 + 1]! * h;
        if (i % 8 === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    if (this.phase === 3) {
      ctx.globalAlpha = 0.18 + Math.sin(time * 12) * 0.08;
      ctx.fillStyle = PALETTE.error;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
    }
    if (this.flash > 0) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = PALETTE.select;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = PALETTE.line;
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();

    if (this.tauntT > 0) this.renderTaunt(ctx);
  }

  private renderTaunt(ctx: CanvasRenderingContext2D): void {
    ctx.font = `700 13px ${MONO_FONT}`;
    if (this.tauntW === 0) this.tauntW = ctx.measureText(this.taunt).width + 20;
    const w = this.tauntW;
    const x = clamp(this.x - w / 2, 8, window.innerWidth - w - 8);
    const y = this.y + this.h / 2 + 18;
    ctx.globalAlpha = Math.min(1, this.tauntT * 3);
    ctx.fillStyle = PALETTE.line;
    ctx.fillRect(x + 3, y + 3, w, 26);
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(x, y, w, 26);
    ctx.strokeStyle = PALETTE.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, 26);
    ctx.fillStyle = PALETTE.line;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.taunt, x + 10, y + 13.5);
    ctx.globalAlpha = 1;
  }
}
