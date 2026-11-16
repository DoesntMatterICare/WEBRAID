/** Small DOM helpers shared by the HUD, intro and victory screens. */

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

export function faviconUrl(): string {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]');
  if (link?.href) return link.href;
  return location.protocol.startsWith('http') ? `${location.origin}/favicon.ico` : '';
}

/** The site's favicon as a small square (hidden if it fails to load). */
export function favicon(): HTMLElement {
  const wrap = h('span', 'fav');
  const url = faviconUrl();
  if (url) {
    const img = h('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    img.addEventListener('error', () => img.remove());
    wrap.append(img);
  }
  return wrap;
}
