import { formatTime } from '../scoring';
import { favicon, fmt, h } from './dom';
import { copyCard, renderShareCard, saveCard, type ShareData } from './share-card';

export interface VictoryHandlers {
  again: () => void;
  exit: () => void;
  /** Receives object URLs so the restorer can revoke them on exit. */
  track: (url: string) => void;
}

/**
 * End screen as an error page — 404 when you win (the site no longer exists),
 * 500 when you lose — with the battle-receipt share card beside it.
 */
export function showVictory(overlay: HTMLElement, d: ShareData, handlers: VictoryHandlers): void {
  const page = h('div', 'errpage');
  const left = h('div', 'err-left');
  left.append(h('div', 'code', d.victory ? '404' : '500'));

  const head = h('div', 'err-head');
  const site = h('div', 'err-site');
  site.append(favicon(), h('span', '', d.domain));
  head.append(
    site,
    h('h1', 'err-title', d.victory ? 'This page could not be found.' : 'The page fought back.'),
    h(
      'p',
      'err-sub',
      d.victory
        ? `Because you destroyed it in ${formatTime(d.time)}.`
        : `ERR_RAID_FAILED after ${formatTime(d.time)}.`,
    ),
  );

  const headers = h('pre', 'headers');
  const rows: Array<[string, string]> = [
    ['HTTP/1.1', d.victory ? '404 Not Found' : '500 Internal Raid Error'],
    ['x-raid-rank', d.rank],
    ['x-raid-score', fmt(d.score)],
    ['x-raid-time', formatTime(d.time)],
    ['x-raid-accuracy', `${Math.round(d.accuracy * 100)}%`],
    ['x-raid-best-combo', String(d.bestCombo)],
    ...(d.bossName ? ([['x-raid-boss', d.bossDefeated ? 'defeated' : 'survived']] as Array<[string, string]>) : []),
  ];
  rows.forEach(([k, v], i) => {
    const row = h('span', i === 0 ? 'hrow status' : 'hrow');
    row.style.animationDelay = `${0.3 + i * 0.05}s`;
    row.append(h('b', '', i === 0 ? `${k} ` : `${k}: `), h('span', '', v));
    headers.append(row);
  });

  const buttons = h('div', 'buttons');
  const again = h('button', 'btn primary');
  again.append(h('span', '', '↻ Reload'), h('kbd', '', 'R'));
  const exit = h('button', 'btn');
  exit.append(h('span', '', '← Back to page'), h('kbd', '', 'ESC'));
  again.addEventListener('click', handlers.again);
  exit.addEventListener('click', handlers.exit);
  buttons.append(again, exit);
  left.append(head, headers, buttons);

  // Share card: the receipt itself is the preview.
  const card = renderShareCard(d);
  card.className = 'receipt';
  const share = h('div', 'share');
  const actions = h('div', 'share-actions');
  const copy = h('button', 'btn small', 'Copy receipt');
  const save = h('button', 'btn small', 'Save PNG');
  copy.addEventListener('click', () => {
    void copyCard(card).then((ok) => {
      copy.textContent = ok ? 'Copied ✓' : 'Copy blocked — use Save';
    });
  });
  save.addEventListener('click', () => {
    void saveCard(card, d.domain, handlers.track).then((ok) => {
      save.textContent = ok ? 'Saved ✓' : 'Save failed';
    });
  });
  actions.append(copy, save);
  share.append(card, actions);

  page.append(left, share);
  overlay.className = `overlay end show ${d.victory ? 'win' : 'lose'}`;
  overlay.replaceChildren(page);
}
