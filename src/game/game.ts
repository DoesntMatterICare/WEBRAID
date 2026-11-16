import type { EnemySpec } from '@/shared/types';
import { Director } from './director';
import { findBoss, siteName as bossSiteName } from './dom/boss-finder';
import { Restorer } from './dom/restorer';
import { fillerSpecs, scanPage } from './dom/scanner';
import { Aberration } from './engine/aberration';
import { Sfx } from './engine/audio';
import { circleRect, SpatialHash } from './engine/collision';
import { PageDamage } from './engine/damage';
import { Fx } from './engine/fx';
import { Input } from './engine/input';
import { Loop } from './engine/loop';
import { PALETTE, applyTheme, detectDarkPage, makeHalftone } from './engine/render';
import { applyWorld, setWorld } from './engine/xform';
import { Boss, BossState } from './entities/boss';
import { Bullets, Owner } from './entities/bullets';
import { createEnemy, Enemy, State, ToxicZones, updateEnemy, type World } from './entities/enemies';
import { Player } from './entities/player';
import { Scoring } from './scoring';
import { HUD, type HudStats } from './ui/hud';
import { hideIntro, showIntro } from './ui/intro';
import { showVictory } from './ui/victory';

const STEP = 1 / 60;
const INTRO_TIME = 3.4;
const SCAN_START = 0.5;
const SCAN_TIME = 1.6;
const MIN_ENEMIES = 10;
const HINT_TIME = 8;
const BOSS_OUTRO = 1.4;
const GLOBAL_KEY = '__WEBRAID__';

/** Wave announcements are HTTP status lines; the last wave is always 429. */
const WAVE_STATUS = ['102 PROCESSING', '206 PARTIAL CONTENT', '409 CONFLICT', '418 I’M A TEAPOT', '503 OVERLOADED'];
const FINAL_STATUS = '429 TOO MANY REQUESTS';

type Phase = 'intro' | 'play' | 'boss' | 'end';

function siteName(): string {
  return location.hostname.replace(/^www\./, '') || document.title.slice(0, 40) || 'this page';
}

export class Game implements World {
  // World
  player!: Player;
  readonly bullets = new Bullets();
  readonly fx = new Fx();
  readonly zones = new ToxicZones();
  width = window.innerWidth;
  height = window.innerHeight;
  time = 0;

  private readonly restorer = new Restorer();
  private readonly loop = new Loop(STEP, (dt) => this.update(dt), () => this.render());
  private readonly hash = new SpatialHash<Enemy>(96);
  private readonly damageLayer = new PageDamage();
  private readonly aberration = new Aberration();
  private readonly sfx = new Sfx();
  private readonly scoring = new Scoring();
  private readonly domain = siteName();
  private readonly torn = new Set<number>();
  private readonly hudStats: HudStats = { hp: 0, maxHp: 0, score: 0, combo: 0, mult: 1, wave: 0, totalWaves: 0, dash: 1, left: 0, time: 0 };
  private hud!: HUD;
  private input!: Input;
  private ctx!: CanvasRenderingContext2D;
  private dpr = 1;
  /** Wave enemies + reserve minions (reserve stays dormant until the boss summons it). */
  private enemies: Enemy[] = [];
  private reserve: Enemy[] = [];
  private scanOrder: Enemy[] = [];
  private director!: Director;
  private boss!: Boss;
  private halftone: CanvasPattern | null = null;

  // Callbacks created once (not a fresh closure every update).
  private readonly fireOpts = { r: 4, life: 1.3 };
  private readonly onFire = (x: number, y: number, angle: number): void => {
    this.bullets.fire(Owner.Player, x, y, angle, 980, this.fireOpts);
    this.scoring.shot();
    this.sfx.shoot();
  };
  private readonly onSummon = (x: number, y: number): boolean => this.summon(x, y);

  private phase: Phase = 'intro';
  private phaseT = 0;
  private paperFx = 0;
  private outro = 0;
  private darkPage = false;
  private hintsFaded = false;

  async start(): Promise<void> {
    const t0 = performance.now();
    // Match the page: ink-on-paper for light sites, inverted lines for dark ones.
    const dark = detectDarkPage();
    this.darkPage = dark;
    applyTheme(dark);

    // 1. Find the boss, then scan + snapshot while the page is still untouched.
    const bossTarget = await findBoss();
    const scan = await scanPage(bossTarget.el);
    if (this.restorer.isRestored) return; // toggled off while scanning
    const specs: EnemySpec[] = scan.specs;
    this.player = new Player(this.width / 2, this.height * 0.8);
    if (specs.length < MIN_ENEMIES) specs.push(...fillerSpecs(14 - specs.length, this.player));
    const waveEnemies = specs.map(createEnemy);
    this.reserve = scan.reserve.map(createEnemy);
    this.enemies = [...waveEnemies, ...this.reserve];
    this.scanOrder = [...this.enemies].sort((a, b) => a.y - b.y || a.x - b.x);
    this.director = new Director(waveEnemies);
    this.boss = new Boss(bossTarget, bossSiteName(), waveEnemies.length);

    // 2. Overlay (canvas + HUD in a closed shadow root).
    this.hud = new HUD(this.domain, this.player.maxHp, dark);
    document.documentElement.appendChild(this.hud.host);
    this.restorer.addNode(this.hud.host);
    this.ctx = this.hud.canvas.getContext('2d')!;
    this.resize();

    // 3. Hide the originals; the canvas now draws them in place.
    for (const s of [...specs, ...scan.reserve]) {
      if (!s.el) continue;
      this.restorer.hide(s.el, s.hide);
      // Videos keep playing silently inside their enemy card; sound comes back after.
      if (s.el instanceof HTMLVideoElement) this.restorer.mute(s.el);
    }
    if (bossTarget.el) this.restorer.hide(bossTarget.el);
    // Any other playing media on the page would fight our sound effects.
    for (const m of document.querySelectorAll<HTMLMediaElement>('video, audio')) {
      if (!m.paused) this.restorer.mute(m);
    }

    this.installGuards();
    this.input = new Input(this.hud.canvas);
    this.restorer.onRestore(() => this.input.detach());
    this.restorer.onRestore(() => this.loop.stop());
    this.restorer.onRestore(() => this.sfx.close());

    showIntro(this.hud.overlay, this.domain, this.enemies.length, this.boss.name);
    requestAnimationFrame(() => this.hud.setDesaturation(true));
    this.loop.start();
    console.info(`[WEBRAID] raid ready in ${Math.round(performance.now() - t0)} ms, ${this.enemies.length} enemies, boss: ${this.boss.name}`);
  }

  /** Undo everything. `again` immediately starts a fresh raid on the restored page. */
  exit(again = false): void {
    if (this.restorer.isRestored) return;
    this.restorer.restore();
    const g = globalThis as Record<string, unknown>;
    if (g[GLOBAL_KEY] === this) delete g[GLOBAL_KEY];
    if (again) requestAnimationFrame(() => startRaid());
  }

  private installGuards(): void {
    // The level is the current viewport: hold the scroll position without
    // touching overflow (that would reflow the page and misalign sprites).
    const sx = window.scrollX;
    const sy = window.scrollY;
    const onScroll = (): void => {
      if (window.scrollX !== sx || window.scrollY !== sy) window.scrollTo(sx, sy);
    };
    const onResize = (): void => this.resize();
    const onHide = (): void => this.exit();
    // Audio may only start after a user gesture inside the page.
    const unlock = (): void => this.sfx.unlock();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('keydown', unlock, true);
    this.hud.canvas.addEventListener('pointerdown', unlock);
    this.restorer.onRestore(() => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('keydown', unlock, true);
    });

    // Clicks on our overlay must not reach the site's own handlers.
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick']) {
      this.hud.host.addEventListener(type, (e) => e.stopPropagation());
    }

    // Keys must not type into whatever the page had focused.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.hud.canvas.width = Math.round(this.width * this.dpr);
    this.hud.canvas.height = Math.round(this.height * this.dpr);
    this.damageLayer.resize(this.width, this.height, this.dpr);
    this.aberration.resize(this.hud.canvas.width, this.hud.canvas.height);
    this.halftone = this.ctx.createPattern(makeHalftone(), 'repeat');
  }

  // ---------------------------------------------------------------- update

  private update(dt: number): void {
    if (this.input.consume('Escape')) {
      this.exit();
      return;
    }
    if (this.input.consume('KeyM')) this.hud.setMuted(this.sfx.toggleMute());

    this.fx.updateCamera(dt);
    if (this.fx.hitStop > 0) {
      this.fx.hitStop -= dt; // freeze-frame; inputs stay queued
      return;
    }

    this.time += dt;
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        this.updateIntro();
        break;
      case 'play':
      case 'boss':
        this.scoring.tick(dt);
        this.updatePlay(dt);
        break;
      case 'end':
        this.bullets.update(dt, this.width, this.height);
        if (this.input.consume('KeyR')) {
          this.exit(true);
          return;
        }
        if (this.input.consume('Enter')) {
          this.exit();
          return;
        }
        break;
    }

    this.fx.update(dt);
    this.input.endFrame();
    if (this.phase === 'end') return;

    const s = this.hudStats; // reused object: no per-frame allocation
    s.hp = this.player.hp;
    s.maxHp = this.player.maxHp;
    s.score = this.scoring.score;
    s.combo = this.scoring.combo;
    s.mult = this.scoring.multiplier;
    s.wave = this.director.wave;
    s.totalWaves = this.director.totalWaves;
    s.dash = this.player.dashReady;
    s.time = this.scoring.time;
    let left = 0;
    for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i]!.state !== State.Dead && this.enemies[i]!.state !== State.Dormant) left++;
    s.left = left + (this.phase === 'play' ? this.dormantInWaves() : 0) + (this.boss.alive ? 1 : 0);
    this.hud.update(s);
    if (this.phase === 'boss' && this.boss.alive) this.hud.updateBoss(this.boss.fraction, this.boss.phase);
  }

  private dormantInWaves(): number {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      if (e.state === State.Dormant && !this.reserve.includes(e)) n++;
    }
    return n;
  }

  private updateIntro(): void {
    const t = this.phaseT;
    this.paperFx = Math.min(1, t / 0.9);

    // "Inspect element" each hostile one, top to bottom.
    const k = (t - SCAN_START) / SCAN_TIME;
    const upTo = Math.floor(Math.max(0, Math.min(1, k)) * this.scanOrder.length);
    for (let i = 0; i < upTo; i++) {
      const e = this.scanOrder[i]!;
      if (e.scanT < 0) {
        e.scanT = this.time;
        if (i % 3 === 0) this.sfx.hit();
      }
    }

    if (t >= INTRO_TIME) {
      for (const e of this.enemies) if (e.scanT < 0) e.scanT = this.time;
      this.phase = 'play';
      this.phaseT = 0;
      hideIntro(this.hud.overlay);
      this.hud.setChromeVisible(true);
    }
  }

  private waveStatus(): string {
    const w = this.director.wave;
    if (w >= this.director.totalWaves) return FINAL_STATUS;
    return WAVE_STATUS[(w - 1) % WAVE_STATUS.length]!;
  }

  private startBoss(): void {
    this.phase = 'boss';
    this.phaseT = 0;
    const b = this.boss;
    const r = b.target.rect;
    if (b.target.el) this.damageLayer.tear(r.x, r.y, r.w, r.h, b.target.el.outerHTML.slice(0, 700));
    b.rise();
    this.hud.showBoss(b.name);
    this.hud.banner('Boss', '511 NETWORK AUTHENTICATION REQUIRED');
    this.sfx.wave();
    this.fx.shake(0.6);
    this.fx.aberrate();
    this.fx.ring(r.x + r.w / 2, r.y + r.h / 2, PALETTE.error, 220, 0.8, 6);
  }

  /** Boss phase 2+: a leftover page element (or a filler) detaches and joins the fight. */
  private summon(x: number, y: number): boolean {
    let e = this.reserve.find((m) => m.state === State.Dormant);
    if (!e) {
      if (this.enemies.length > 170) return false;
      e = createEnemy(fillerSpecs(1, this.player)[0]!);
      this.enemies.push(e);
    } else {
      // It rises from its spot on the page, then flies out of the boss.
      this.fx.bits(e.homeX, e.homeY, PALETTE.paperDark, 6, 200, 4);
    }
    e.x = x;
    e.y = y;
    e.scanT = this.time;
    e.wake();
    this.fx.ring(x, y, PALETTE.error, 40, 0.35, 3);
    return true;
  }

  private updatePlay(dt: number): void {
    if (this.phase === 'play') {
      if (this.director.update(dt)) {
        this.hud.banner(`Wave ${this.director.wave}`, this.waveStatus());
        this.sfx.wave();
      }
      if (this.director.finished) this.startBoss();
    }
    if (!this.hintsFaded && this.scoring.time > HINT_TIME) {
      this.hintsFaded = true;
      this.hud.fadeHints();
    }

    const p = this.player;
    const dashed = p.update(dt, this.input, this.width, this.height, this.onFire);
    if (dashed) {
      this.sfx.dash();
      this.fx.ring(p.x, p.y, PALETTE.line, 40, 0.3, 3);
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      if (!e.alive) continue;
      updateEnemy(e, dt, this);
      // The moment an element detaches, the page gets a hole where it was.
      if (e.state !== State.Dormant && !this.torn.has(e.id)) {
        this.torn.add(e.id);
        if (e.el) this.damageLayer.tear(e.homeX - e.w0 / 2, e.homeY - e.h0 / 2, e.w0, e.h0, e.source);
        this.fx.bits(e.homeX, e.homeY, PALETTE.paperDark, Math.min(14, 4 + Math.round(e.w0 / 40)), 220, 5);
      }
    }

    const boss = this.boss;
    if (this.phase === 'boss') {
      boss.update(dt, this, this.onSummon);
      if (boss.phaseChanged) {
        boss.phaseChanged = false;
        this.hud.banner(boss.phase === 3 ? 'Enraged' : `Phase ${boss.phase}`, boss.phase === 3 ? '508 LOOP DETECTED' : '202 ACCEPTED');
        this.fx.aberrate();
        this.fx.shake(0.7);
        this.fx.freeze(0.08);
        this.sfx.hurt();
      }
    }

    this.bullets.update(dt, this.width, this.height);
    this.zones.update(dt);
    if (this.zones.hits(p.x, p.y, p.r * 0.6) && p.hit()) this.hurt(0, -1);

    // Broad phase.
    this.hash.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      if (e.alive) this.hash.insert(e, e.x - e.w / 2 - 8, e.y - e.h / 2 - 8, e.w + 16, e.h + 16);
    }

    const bossHittable = boss.state === BossState.Active;
    const list = this.bullets.pool.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i]!;
      if (b.owner === Owner.Player) {
        if (bossHittable && circleRect(b.x, b.y, b.r, boss.x - boss.w / 2, boss.y - boss.h / 2, boss.w, boss.h)) {
          this.scoring.hit();
          this.fx.sparks(b.x, b.y, PALETTE.error, 4, 320, Math.atan2(-b.vy, -b.vx), 1.4);
          this.sfx.hit();
          this.bullets.pool.releaseAt(i);
          if (boss.damage(b.damage)) this.killBoss();
          continue;
        }
        const near = this.hash.at(b.x, b.y);
        if (!near) continue;
        for (let j = 0; j < near.length; j++) {
          const e = near[j]!;
          if (!e.alive) continue;
          if (circleRect(b.x, b.y, b.r, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h)) {
            this.scoring.hit();
            this.fx.sparks(b.x, b.y, e.armored ? PALETTE.white : PALETTE.line, e.armored ? 6 : 3, 300, Math.atan2(-b.vy, -b.vx), 1.3);
            this.fx.bits(b.x, b.y, e.isText ? PALETTE.select : e.stats.color, 2, 140, 3);
            this.sfx.hit();
            this.damage(e, b.damage, b.vx, b.vy);
            this.bullets.pool.releaseAt(i);
            break;
          }
        }
      } else {
        const rr = p.r * 0.8 + b.r;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy < rr * rr && p.hit()) {
          this.hurt(b.vx, b.vy);
          this.bullets.pool.releaseAt(i);
        }
      }
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      if (e.state !== State.Active || !e.stats.contactDamage) continue;
      if (circleRect(p.x, p.y, p.r * 0.8, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h) && p.hit()) {
        this.knockback(e.x, e.y);
      }
    }
    if (bossHittable && circleRect(p.x, p.y, p.r * 0.8, boss.x - boss.w / 2, boss.y - boss.h / 2, boss.w, boss.h) && p.hit()) {
      this.knockback(boss.x, boss.y);
    }

    if (p.hp <= 0) {
      this.end(false);
      return;
    }
    if (this.outro > 0) {
      this.outro -= dt;
      if (this.outro <= 0) this.end(true);
    }
  }

  private knockback(fromX: number, fromY: number): void {
    const p = this.player;
    const a = Math.atan2(p.y - fromY, p.x - fromX);
    p.vx = Math.cos(a) * 600;
    p.vy = Math.sin(a) * 600;
    this.hurt(p.x - fromX, p.y - fromY);
  }

  private damage(e: Enemy, amount: number, dirX: number, dirY: number): void {
    if (e.state === State.Dormant) e.wake(); // shooting the page wakes it early
    e.hp -= amount;
    e.flash = 0.06;
    if (e.hp <= 0) this.kill(e, dirX, dirY);
  }

  private kill(e: Enemy, dirX: number, dirY: number): void {
    e.state = State.Dead;
    const pts = this.scoring.kill(e.kind);
    const heavy = e.kind === 'brute' || e.kind === 'toxic' || e.kind === 'tank';
    const [cols, rows] = e.stats.shards;
    this.fx.shatter(e.deathSprite, e.x, e.y, e.w, e.h, cols, rows, e.kind === 'brute' ? 460 : 320, e.cw, e.ch);
    this.fx.glyphs(e.x, e.y, e.w, e.source, heavy ? 22 : 9);
    this.fx.bits(e.x, e.y, e.stats.color, heavy ? 14 : 6, 380, 5);
    this.fx.ring(e.x, e.y, PALETTE.line, Math.max(e.w, e.h) * 0.8, 0.35, 4);
    this.fx.popup(e.x, e.y - e.h / 2 - 10, e.kind === 'swarmer' ? '404' : `+${pts}`, e.kind === 'swarmer' ? PALETTE.error : e.stats.color, heavy ? 16 : 13);
    this.fx.shake(heavy ? 0.35 : 0.12, dirX, dirY);
    this.sfx.cut(heavy);
    if (heavy) this.fx.freeze(0.04);
    if (e.kind === 'brute' || e.kind === 'toxic') {
      this.fx.aberrate();
      this.damageLayer.crack(e.x, e.y, 50 + Math.random() * 30);
    }
    if (this.scoring.combo % 10 === 0) this.fx.popup(this.player.x, this.player.y - 40, `×${this.scoring.combo} COMBO`, PALETTE.marker, 18);
  }

  private killBoss(): void {
    const b = this.boss;
    const pts = this.scoring.kill('boss');
    this.fx.shatter(b.target.sprite.canvas, b.x, b.y, b.w, b.h, 8, 6, 620);
    for (let i = 0; i < 3; i++) this.fx.ring(b.x, b.y, i === 1 ? PALETTE.error : PALETTE.line, 160 + i * 120, 0.6 + i * 0.25, 6 - i);
    this.fx.sparks(b.x, b.y, PALETTE.error, 40, 900);
    this.fx.glyphs(b.x, b.y, b.w, b.name, 30);
    this.fx.popup(b.x, b.y - b.h / 2 - 16, `+${pts}`, PALETTE.marker, 22);
    this.fx.shake(1);
    this.fx.freeze(0.18);
    this.fx.aberrate();
    this.fx.doFlash(0.6, '#ffffff');
    this.damageLayer.crack(b.x, b.y, Math.max(this.width, this.height) * 0.4, true);
    this.sfx.cut(true);
    this.hud.hideBoss();
    // The boss takes its minions with it.
    for (const e of this.enemies) {
      if (e.state !== State.Active && e.state !== State.Waking) continue;
      e.state = State.Dead;
      this.fx.shatter(e.deathSprite, e.x, e.y, e.w, e.h, 3, 2, 300, e.cw, e.ch);
    }
    this.outro = BOSS_OUTRO;
  }

  private hurt(dirX: number, dirY: number): void {
    this.scoring.hurt();
    this.fx.shake(0.7, dirX, dirY);
    this.fx.freeze(0.08);
    this.fx.aberrate();
    this.fx.hurt = 1;
    this.fx.popup(this.player.x, this.player.y - 36, 'TAB CLOSED', PALETTE.error, 13);
    this.fx.sparks(this.player.x, this.player.y, PALETTE.error, 14, 420);
    this.damageLayer.crack(this.player.x, this.player.y, 90);
    this.sfx.hurt();
  }

  private end(victory: boolean): void {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.phaseT = 0;
    const sc = this.scoring;
    const bonuses = sc.settle(victory);
    if (victory) {
      this.fx.doFlash(0.6, '#ffffff');
      this.sfx.victory();
    } else {
      const p = this.player;
      this.fx.shake(1);
      this.fx.aberrate();
      this.fx.bits(p.x, p.y, PALETTE.line, 30, 500, 5);
      this.sfx.defeat();
    }
    this.hud.setChromeVisible(false);
    showVictory(
      this.hud.overlay,
      {
        domain: this.domain,
        victory,
        rank: sc.rank(victory),
        score: sc.score,
        time: sc.time,
        accuracy: sc.accuracy,
        bestCombo: sc.bestCombo,
        tabsClosed: sc.damageTaken,
        receipt: sc.receipt(),
        bonuses,
        bossName: this.boss.name,
        bossDefeated: sc.bossDefeated,
        date: new Date(),
      },
      {
        again: () => this.exit(true),
        exit: () => this.exit(),
        track: (url) => this.restorer.onRestore(() => URL.revokeObjectURL(url)),
      },
    );
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const ctx = this.ctx;
    const { width: w, height: h, dpr } = this;
    const fx = this.fx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Newsprint halftone over the greyed page (screen space: it does not shake).
    if (this.halftone && this.paperFx > 0) {
      ctx.globalAlpha = this.paperFx;
      ctx.fillStyle = this.halftone;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // World space: positional + rotational camera shake around the screen centre.
    setWorld(dpr, w, h, fx.shakeX, fx.shakeY, fx.shakeRot);
    applyWorld(ctx);
    this.damageLayer.render(ctx, w, h);
    this.zones.render(ctx, this.time);

    const intro = this.phase === 'intro';
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) if (list[i]!.state === State.Dormant) list[i]!.render(ctx, this.time, intro);
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!.state;
      if (s === State.Waking || s === State.Active) list[i]!.render(ctx, this.time, intro);
    }
    this.boss.render(ctx, this.time);
    fx.render(ctx);
    this.bullets.render(ctx);
    if (this.player.hp > 0 && !intro) this.player.render(ctx, this.time);
    fx.renderText(ctx);

    // Heavy hits: 3 rendered frames of RGB split (counted here, so hit-stop can't freeze it).
    if (fx.aberration > 0) {
      this.aberration.apply(ctx, Math.round(fx.aberration * 2 * dpr), this.darkPage ? 0.55 : 0.3);
      fx.aberration--;
    }

    // Screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx.renderScreen(ctx, w, h);
    if (this.phase === 'play' || this.phase === 'boss') this.renderReticle(ctx);
  }

  /** The aim reticle is a text I-beam, drawn in screen space at the real cursor. */
  private renderReticle(ctx: CanvasRenderingContext2D): void {
    const mx = this.input.mouseX;
    const my = this.input.mouseY;
    let onTarget = false;
    const near = this.hash.at(mx, my);
    if (near) {
      for (let i = 0; i < near.length; i++) {
        const e = near[i]!;
        if (e.alive && Math.abs(e.x - mx) < e.w / 2 && Math.abs(e.y - my) < e.h / 2) {
          onTarget = true;
          break;
        }
      }
    }
    const b = this.boss;
    if (!onTarget && b.state === BossState.Active && Math.abs(b.x - mx) < b.w / 2 && Math.abs(b.y - my) < b.h / 2) onTarget = true;
    const x = Math.round(mx);
    const y = Math.round(my);
    const half = 13;
    const serif = 5 + this.player.recoil * 3;
    ctx.lineCap = 'square';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? PALETTE.paper : onTarget ? PALETTE.error : PALETTE.line;
      ctx.lineWidth = pass === 0 ? 5 : 2;
      ctx.beginPath();
      ctx.moveTo(x, y - half);
      ctx.lineTo(x, y + half);
      ctx.moveTo(x - serif, y - half);
      ctx.lineTo(x + serif, y - half);
      ctx.moveTo(x - serif, y + half);
      ctx.lineTo(x + serif, y + half);
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.stroke();
    }
  }
}

export function startRaid(): void {
  const g = globalThis as Record<string, unknown>;
  const game = new Game();
  g[GLOBAL_KEY] = game;
  game.start().catch((err: unknown) => {
    console.error('[WEBRAID] failed to start', err);
    game.exit();
  });
}

/** Toolbar click / Alt+R: start a raid, or end the one in progress. */
export function toggleRaid(): void {
  const current = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Game | undefined;
  if (current) current.exit();
  else startRaid();
}
