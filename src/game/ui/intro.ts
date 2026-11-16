import { h } from './dom';

/**
 * Intro: an HTTP request log types itself out while the canvas "inspects"
 * every hostile element, then the site name slams in.
 */
export function showIntro(overlay: HTMLElement, domain: string, enemyCount: number, bossName: string | null): void {
  overlay.className = 'overlay intro show';
  const log = h('div', 'log');
  const lines: Array<[string, string]> = [
    ['req', `GET raid://${domain}/ HTTP/1.1`],
    ['res ok', 'HTTP/1.1 200 OK'],
    ['res', 'content-type: text/hostile'],
    ['res', `x-hostile-elements: ${enemyCount}`],
    ...(bossName ? ([['res', `x-boss: ${bossName.toLowerCase()}`]] as Array<[string, string]>) : []),
    ['res warn', 'x-page-status: AWAKE'],
  ];
  lines.forEach(([cls, text], i) => {
    const line = h('div', `line ${cls}`, text);
    line.style.animationDelay = `${0.15 + i * 0.3}s`;
    log.append(line);
  });
  const title = h('div', 'intro-title');
  title.append(h('span', 'intro-kicker', 'NOW RAIDING'), h('span', 'intro-domain', domain));
  const keys = h('div', 'intro-keys');
  for (const [k, label] of [
    ['WASD', 'move'],
    ['CLICK', 'select & cut'],
    ['SPACE', 'dash'],
    ['M', 'sound'],
    ['ESC', 'leave'],
  ]) {
    const item = h('span', 'hint');
    item.append(h('kbd', '', k!), h('span', '', label!));
    keys.append(item);
  }
  overlay.replaceChildren(log, title, keys);
}

export function hideIntro(overlay: HTMLElement): void {
  overlay.classList.add('leaving');
  setTimeout(() => {
    if (overlay.classList.contains('leaving')) {
      overlay.className = 'overlay';
      overlay.replaceChildren();
    }
  }, 400);
}
