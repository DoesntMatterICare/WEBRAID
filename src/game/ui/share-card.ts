import type { EnemyKind } from '@/shared/types';
import { formatTime, type Bonus, type Rank, type ReceiptLine } from '../scoring';

/**
 * Victory share card: a "battle receipt" rendered on an offscreen canvas.
 *
 * It is drawn ONLY from text and procedural shapes — never from page sprites
 * or the shard atlas — so the canvas is never tainted and toBlob() always
 * works, even after a raid full of cross-origin images. Canvas has no
 * `tabular-nums`, so every number uses the monospace face to keep columns.
 */
export interface ShareData {
  domain: string;
  victory: boolean;
  rank: Rank;
  score: number;
  time: number;
  accuracy: number;
  bestCombo: number;
  tabsClosed: number;
  receipt: ReceiptLine[];
  bonuses: Bonus[];
  bossName: string | null;
  bossDefeated: boolean;
  date: Date;
}

const W = 600;
const SCALE = 2;
const MONO = '"JetBrains Mono", "Cascadia Code", "SF Mono", ui-monospace, Consolas, monospace';
const HEAVY = '"Inter Tight", "Segoe UI Black", "Arial Black", system-ui, sans-serif';
const INK = '#16161a';
const PAPER = '#f6f3ea';
const RED = '#ff3131';
const BLUE = '#2f6bff';

const ITEM_NAMES: Record<EnemyKind | 'boss', string> = {
  swarmer: '<a> LINKS',
  tank: '<h1-3> HEADINGS',
  brute: '<img> MEDIA',
  turret: '<button> BUTTONS',
  toxic: '<iframe> ADS',
  boss: 'LOGO (BOSS)',
};

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** Deterministic pseudo-random from the score, so the same raid → same barcode. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function dotted(ctx: CanvasRenderingContext2D, left: string, right: string, y: number, x0: number, x1: number, bold = false): void {
  ctx.font = `${bold ? 800 : 500} 18px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText(left, x0, y);
  ctx.textAlign = 'right';
  ctx.fillText(right, x1, y);
  const lw = ctx.measureText(left).width;
  ctx.textAlign = 'left';
  const rw = ctx.measureText(right).width;
  ctx.globalAlpha = 0.35;
  ctx.font = `500 18px ${MONO}`;
  let x = x0 + lw + 10;
  while (x < x1 - rw - 14) {
    ctx.fillText('.', x, y);
    x += 9;
  }
  ctx.globalAlpha = 1;
}

function rule(ctx: CanvasRenderingContext2D, y: number, x0: number, x1: number): void {
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

/** Torn receipt edge (zig-zag) along y, pointing up (dir=-1) or down (1). */
function zigzag(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, dir: 1 | -1): void {
  const step = 14;
  ctx.lineTo(x1, y);
  for (let x = x1; x > x0; x -= step) ctx.lineTo(x - step / 2, y + (dir * step) / 2), ctx.lineTo(x - step, y);
}

/** Card height grows with the number of receipt lines so nothing overflows the paper. */
function cardHeight(d: ShareData): number {
  const items = Math.min(6, d.receipt.length) + Math.min(4, d.bonuses.length);
  const stats = d.bossName ? 5 : 4;
  return 790 + (items + stats) * 30;
}

export function renderShareCard(d: ShareData): HTMLCanvasElement {
  const H = cardHeight(d);
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // Backdrop: ink with a halftone field, receipt on top.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  for (let y = 6; y < H; y += 12) for (let x = (y / 12) % 2 ? 6 : 12; x < W; x += 12) ctx.fillRect(x, y, 2, 2);

  const L = 50;
  const R = W - 50;
  const top = 46;
  const bottom = H - 46;
  ctx.save();
  ctx.translate(0, 0);
  ctx.rotate(-0.012);
  ctx.beginPath();
  ctx.moveTo(L, top);
  ctx.lineTo(R, top);
  ctx.lineTo(R, bottom);
  zigzag(ctx, L, R, bottom, 1);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  const x0 = L + 34;
  const x1 = R - 34;
  let y = top + 70;
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.font = `900 54px ${HEAVY}`;
  ctx.fillText('WEBRAID', W / 2, y);
  y += 32;
  ctx.font = `700 16px ${MONO}`;
  ctx.fillText('* * *  BATTLE RECEIPT  * * *', W / 2, y);
  y += 30;
  ctx.font = `800 22px ${MONO}`;
  ctx.fillText(d.domain.slice(0, 32), W / 2, y);
  y += 24;
  ctx.font = `500 15px ${MONO}`;
  const stamp = `${d.date.toISOString().slice(0, 10)}  ${d.date.toTimeString().slice(0, 5)}`;
  ctx.fillText(`${stamp}   RAID #${(d.score % 99991).toString().padStart(5, '0')}`, W / 2, y);
  y += 24;
  rule(ctx, y, x0, x1);
  y += 36;

  // Line items.
  for (const line of d.receipt.slice(0, 6)) {
    dotted(ctx, `${ITEM_NAMES[line.kind]} x${line.count}`, fmt(line.points), y, x0, x1);
    y += 30;
  }
  for (const b of d.bonuses.slice(0, 4)) {
    dotted(ctx, `+ ${b.label.toUpperCase()}`, fmt(b.points), y, x0, x1);
    y += 30;
  }
  y += 4;
  rule(ctx, y, x0, x1);
  y += 46;
  ctx.font = `900 34px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL', x0, y);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(d.score), x1, y);
  y += 24;
  rule(ctx, y, x0, x1);
  y += 38;

  const stats: Array<[string, string]> = [
    ['TIME', formatTime(d.time)],
    ['ACCURACY', `${Math.round(d.accuracy * 100)}%`],
    ['BEST COMBO', `x${d.bestCombo}`],
    ['TABS CLOSED', String(d.tabsClosed)],
  ];
  if (d.bossName) stats.push(['BOSS', d.bossDefeated ? 'DEFEATED' : 'SURVIVED']);
  for (const [k, v] of stats) {
    dotted(ctx, k, v, y, x0, x1, true);
    y += 30;
  }

  // Rank stamp.
  const sx = x1 - 70;
  const sy = y + 70;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-0.25);
  ctx.strokeStyle = d.rank === 'S' ? BLUE : RED;
  ctx.fillStyle = d.rank === 'S' ? BLUE : RED;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `800 13px ${MONO}`;
  ctx.fillText('R A N K', 0, -26);
  ctx.font = `900 64px ${HEAVY}`;
  ctx.fillText(d.rank, 0, 34);
  ctx.restore();

  // Headline.
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `900 30px ${HEAVY}`;
  const verdict = d.victory ? 'PAGE DESTROYED' : 'THE PAGE WON';
  ctx.fillText(verdict, x0, y + 50);
  ctx.font = `500 16px ${MONO}`;
  ctx.fillText(d.victory ? `404: ${d.domain.slice(0, 22)}` : 'ERR_RAID_FAILED', x0, y + 78);
  ctx.fillText(`not found in ${formatTime(d.time)}`, x0, y + 100);
  y += 170;

  // Barcode from the score.
  const rnd = seeded(d.score * 31 + Math.round(d.time * 10));
  let bx = x0;
  ctx.fillStyle = INK;
  while (bx < x1) {
    const bw = 1 + Math.floor(rnd() * 4);
    if (rnd() > 0.35) ctx.fillRect(bx, y, bw, 64);
    bx += bw + 1 + Math.floor(rnd() * 2);
  }
  y += 88;
  ctx.textAlign = 'center';
  ctx.font = `700 15px ${MONO}`;
  ctx.fillText('THANK YOU FOR RAIDING', W / 2, y);
  y += 22;
  ctx.font = `500 14px ${MONO}`;
  ctx.globalAlpha = 0.65;
  ctx.fillText('beat the internet — one website at a time', W / 2, y);
  ctx.globalAlpha = 1;
  ctx.restore();
  return canvas;
}

export function cardToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/** Download the card. `track` receives the object URL so the restorer can revoke it. */
export async function saveCard(canvas: HTMLCanvasElement, domain: string, track: (url: string) => void): Promise<boolean> {
  const blob = await cardToBlob(canvas);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  track(url);
  const a = document.createElement('a'); // never inserted into the page
  a.href = url;
  a.download = `webraid-${domain.replace(/[^a-z0-9.-]/gi, '_')}.png`;
  a.click();
  return true;
}

/** Copy the card image to the clipboard (needs a user click). */
export async function copyCard(canvas: HTMLCanvasElement): Promise<boolean> {
  const blob = await cardToBlob(canvas);
  if (!blob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}
