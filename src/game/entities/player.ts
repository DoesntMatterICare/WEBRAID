import type { Input } from '../engine/input';
import { CURSOR_AXIS, PALETTE, cursorPath } from '../engine/render';

const SPEED = 330;
const DASH_SPEED = 1150;
const DASH_TIME = 0.14;
const DASH_COOLDOWN = 1.1;
const FIRE_INTERVAL = 0.1;
const INVULN_TIME = 1.2;
const TRAIL = 12;
const SCALE = 1.9;
const TAU = Math.PI * 2;

/**
 * The player is a weaponised mouse pointer. It leaves classic "pointer trails"
 * and shows a busy spinner while invulnerable.
 */
export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  readonly r = 11;
  hp = 5;
  readonly maxHp = 5;
  angle = -Math.PI / 2;
  invuln = 0;
  dashCd = 0;
  /** Recoil kick for the reticle and muzzle. */
  recoil = 0;
  private dashT = 0;
  private dashX = 0;
  private dashY = 0;
  private fireCd = 0;
  private trailX = new Float32Array(TRAIL);
  private trailY = new Float32Array(TRAIL);
  private trailA = new Float32Array(TRAIL);
  private trailI = 0;
  private trailTick = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.trailX.fill(x);
    this.trailY.fill(y);
    this.trailA.fill(this.angle);
  }

  get dashing(): boolean {
    return this.dashT > 0;
  }

  get dashReady(): number {
    return 1 - this.dashCd / DASH_COOLDOWN;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** Returns true on the frame a dash starts. */
  update(dt: number, input: Input, w: number, h: number, fire: (x: number, y: number, angle: number) => void): boolean {
    let mx = 0;
    let my = 0;
    if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
    if (input.down('KeyD', 'ArrowRight')) mx += 1;
    if (input.down('KeyW', 'ArrowUp')) my -= 1;
    if (input.down('KeyS', 'ArrowDown')) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }

    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.recoil = Math.max(0, this.recoil - dt * 9);

    let dashed = false;
    if (input.consume('Space') && this.dashCd === 0) {
      this.dashX = len > 0 ? mx : Math.cos(this.angle);
      this.dashY = len > 0 ? my : Math.sin(this.angle);
      this.dashT = DASH_TIME;
      this.dashCd = DASH_COOLDOWN;
      dashed = true;
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashX * DASH_SPEED;
      this.vy = this.dashY * DASH_SPEED;
    } else {
      const k = Math.min(1, dt * 14);
      this.vx += (mx * SPEED - this.vx) * k;
      this.vy += (my * SPEED - this.vy) * k;
    }

    this.x = Math.max(this.r, Math.min(w - this.r, this.x + this.vx * dt));
    this.y = Math.max(this.r, Math.min(h - this.r, this.y + this.vy * dt));
    this.angle = Math.atan2(input.mouseY - this.y, input.mouseX - this.x);

    this.trailTick += dt;
    if (this.trailTick >= 1 / 45) {
      this.trailTick = 0;
      this.trailX[this.trailI] = this.x;
      this.trailY[this.trailI] = this.y;
      this.trailA[this.trailI] = this.angle;
      this.trailI = (this.trailI + 1) % TRAIL;
    }

    this.fireCd -= dt;
    const tapped = input.consume('Mouse0'); // a quick click still fires one shot
    if ((input.mouseDown || tapped) && this.fireCd <= 0) {
      this.fireCd = FIRE_INTERVAL;
      this.recoil = 1;
      fire(this.x + Math.cos(this.angle) * 18, this.y + Math.sin(this.angle) * 18, this.angle + (Math.random() - 0.5) * 0.04);
    }
    return dashed;
  }

  /** Returns true if the hit landed. */
  hit(): boolean {
    if (this.invuln > 0 || this.dashing || this.hp <= 0) return false;
    this.hp -= 1;
    this.invuln = INVULN_TIME;
    return true;
  }

  /** Draw one pointer whose tip sits ahead of (x,y) along the aim. */
  private drawPointer(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, fill: string, stroke: string, kick: number): void {
    ctx.save();
    ctx.translate(x + Math.cos(angle) * (14 - kick * 4), y + Math.sin(angle) * (14 - kick * 4));
    ctx.rotate(angle - CURSOR_AXIS);
    cursorPath(ctx, SCALE);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    // Pointer trails: stronger when moving fast or dashing.
    const moving = this.speed > 60;
    if (moving) {
      const count = this.dashing ? TRAIL : 6;
      for (let i = TRAIL - count; i < TRAIL; i++) {
        const idx = (this.trailI + i) % TRAIL;
        const a = ((i - (TRAIL - count)) / count) * (this.dashing ? 0.55 : 0.35);
        ctx.globalAlpha = a;
        this.drawPointer(ctx, this.trailX[idx]!, this.trailY[idx]!, this.trailA[idx]!, PALETTE.cursorFill, PALETTE.line, 0);
      }
      ctx.globalAlpha = 1;
    }

    const blink = this.invuln > 0 && Math.floor(time * 16) % 2 === 0;
    // Hard shadow, then the pointer itself.
    ctx.globalAlpha = 0.9;
    this.drawPointer(ctx, this.x + 3, this.y + 3, this.angle, PALETTE.line, PALETTE.line, this.recoil);
    ctx.globalAlpha = 1;
    this.drawPointer(ctx, this.x, this.y, this.angle, blink ? PALETTE.selectSoft : PALETTE.cursorFill, PALETTE.line, this.recoil);

    // Busy spinner while invulnerable ("working in background").
    if (this.invuln > 0) {
      const sx = this.x + 20;
      const sy = this.y + 18;
      ctx.lineWidth = 3;
      ctx.strokeStyle = PALETTE.line;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.select;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, time * 10, time * 10 + 2.2);
      ctx.stroke();
    }
  }
}
