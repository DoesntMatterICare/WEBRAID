import { favicon, fmt, h } from './dom';
import { HUD_CSS } from './hud-css';

export interface HudStats {
  hp: number;
  maxHp: number;
  score: number;
  combo: number;
  mult: number;
  wave: number;
  totalWaves: number;
  /** 0..1 dash readiness. */
  dash: number;
  left: number;
  /** Seconds of play. */
  time: number;
}

type NumKey = keyof HudStats;

/**
 * Ultra-minimal HUD: four corner readouts framed by L-brackets, no panels.
 * Every number uses tabular-nums so nothing jitters as it counts. Lives in a
 * closed Shadow DOM — site CSS can't touch it and it can't touch the site.
 * The overlay element is shared with the intro and victory screens.
 */
export class HUD {
  readonly host: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly desat: HTMLElement;
  private readonly corners: HTMLElement[];
  private readonly pips: HTMLElement[] = [];
  private readonly waveEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly comboEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly dashFill: HTMLElement;
  private readonly leftEl: HTMLElement;
  private readonly soundEl: HTMLElement;
  private readonly hints: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly bossEl: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossPhase: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossLag: HTMLElement;
  private readonly last: Partial<Record<NumKey, number>> = {};
  private shownScore = 0;
  private lastSecond = -1;
  private lastDash = -1;
  private lastBoss = -1;

  constructor(domain: string, maxHp: number, dark: boolean) {
    this.host = document.createElement('webraid-root');
    this.host.setAttribute('style', 'all:initial;position:fixed;inset:0;z-index:2147483647;display:block;contain:strict;');
    this.host.dataset.theme = dark ? 'dark' : 'light';
    this.root = this.host.attachShadow({ mode: 'closed' });

    const style = h('style');
    style.textContent = HUD_CSS;
    this.desat = h('div', 'desat');
    this.canvas = h('canvas', 'stage');

    // Top-left: hull + wave.
    const tl = h('div', 'corner tl');
    const hull = h('div', 'pips');
    for (let i = 0; i < maxHp; i++) {
      const p = h('span', 'pip on');
      this.pips.push(p);
      hull.append(p);
    }
    this.waveEl = h('span', 'val', '—');
    tl.append(row('HULL', hull), row('WAVE', this.waveEl));

    // Top-right: score + combo.
    const tr = h('div', 'corner tr');
    this.scoreEl = h('div', 'big', '0');
    this.comboEl = h('div', 'combo');
    tr.append(h('div', 'label', 'SCORE'), this.scoreEl, this.comboEl);

    // Bottom-left: timer + dash.
    const bl = h('div', 'corner bl');
    this.timeEl = h('div', 'big', '0:00');
    const dash = h('div', 'dash');
    this.dashFill = h('div', 'dash-fill');
    dash.append(this.dashFill);
    bl.append(h('div', 'label', 'TIME'), this.timeEl, row('DASH', dash));

    // Bottom-right: target site, enemies left, sound.
    const br = h('div', 'corner br');
    const site = h('div', 'site');
    site.append(favicon(), h('span', 'domain', domain));
    this.leftEl = h('span', 'val', '0');
    this.soundEl = h('span', 'val muted', 'ON');
    br.append(site, row('LEFT', this.leftEl), row('SOUND [M]', this.soundEl));
    this.corners = [tl, tr, bl, br];

    // Boss bar (top centre, bracketed).
    this.bossEl = h('div', 'boss');
    const bossHead = h('div', 'boss-head');
    this.bossName = h('span', 'boss-name', '');
    this.bossPhase = h('span', 'boss-phase', 'PHASE 1');
    bossHead.append(this.bossName, this.bossPhase);
    const bar = h('div', 'boss-bar');
    this.bossLag = h('div', 'boss-lag');
    this.bossFill = h('div', 'boss-fill');
    bar.append(this.bossLag, this.bossFill);
    this.bossEl.append(bossHead, bar);

    this.hints = h('div', 'hints', 'WASD move · CLICK select & cut · SPACE dash · ESC leave');
    this.bannerEl = h('div', 'banner');
    this.overlay = h('div', 'overlay');

    this.root.append(style, this.desat, this.canvas, ...this.corners, this.bossEl, this.hints, this.bannerEl, this.overlay);
  }

  setDesaturation(on: boolean): void {
    this.desat.classList.toggle('on', on);
  }

  setChromeVisible(visible: boolean): void {
    for (const c of this.corners) c.classList.toggle('show', visible);
    this.hints.classList.toggle('show', visible);
    if (!visible) this.bossEl.classList.remove('show');
  }

  fadeHints(): void {
    this.hints.classList.remove('show');
  }

  setMuted(muted: boolean): void {
    this.soundEl.textContent = muted ? 'OFF' : 'ON';
  }

  showBoss(name: string): void {
    this.bossName.textContent = name;
    this.bossEl.classList.add('show');
  }

  /** Allocation-free: only touches the DOM when a value actually changes. */
  updateBoss(fraction: number, phase: number): void {
    const pct = Math.round(fraction * 1000);
    if (pct === this.lastBoss) return;
    this.lastBoss = pct;
    this.bossFill.style.transform = `scaleX(${fraction})`;
    this.bossLag.style.transform = `scaleX(${fraction})`;
    this.bossPhase.textContent = phase === 3 ? 'ENRAGED' : `PHASE ${phase}`;
    this.bossEl.classList.toggle('enraged', phase === 3);
  }

  hideBoss(): void {
    this.bossEl.classList.remove('show');
  }

  update(s: HudStats): void {
    if (this.last.hp !== s.hp) {
      this.last.hp = s.hp;
      for (let i = 0; i < this.pips.length; i++) this.pips[i]!.classList.toggle('on', i < s.hp);
      this.corners[0]!.classList.toggle('critical', s.hp <= 1);
    }
    if (this.last.wave !== s.wave || this.last.totalWaves !== s.totalWaves) {
      this.last.wave = s.wave;
      this.last.totalWaves = s.totalWaves;
      this.waveEl.textContent = s.wave > 0 ? `${s.wave}/${s.totalWaves}` : '—';
    }
    if (this.last.combo !== s.combo) {
      this.last.combo = s.combo;
      this.comboEl.textContent = s.combo > 1 ? `×${s.mult.toFixed(1)}  ${s.combo} COMBO` : '';
      if (s.combo > 1) {
        this.comboEl.classList.remove('bump');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('bump');
      }
    }
    if (this.last.left !== s.left) {
      this.last.left = s.left;
      this.leftEl.textContent = String(s.left);
    }
    const sec = Math.floor(s.time);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.timeEl.textContent = `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
    }
    const dash = Math.round(s.dash * 20);
    if (dash !== this.lastDash) {
      this.lastDash = dash;
      this.dashFill.style.transform = `scaleX(${dash / 20})`;
      this.dashFill.classList.toggle('ready', dash >= 20);
    }
    if (this.shownScore !== s.score) {
      const diff = s.score - this.shownScore;
      this.shownScore = Math.abs(diff) < 2 ? s.score : this.shownScore + diff * 0.2;
      this.scoreEl.textContent = fmt(this.shownScore);
    }
  }

  /** Wave announcements are HTTP status lines. */
  banner(text: string, status: string): void {
    this.bannerEl.replaceChildren(h('div', 'banner-main', text), h('div', 'banner-sub', status));
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }
}

function row(label: string, value: HTMLElement): HTMLElement {
  const r = h('div', 'row');
  r.append(h('span', 'label', label), value);
  return r;
}
