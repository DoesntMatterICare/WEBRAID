import { MONO_FONT } from './render';

/**
 * Pre-rendered tiny sprites for things drawn hundreds of times per frame
 * (falling source-code glyphs, enemy bullet orbs). Text rasterisation happens
 * once per (char, colour, size); per frame it is a plain drawImage.
 * Lookups happen at spawn time, never in the render loop.
 */
const cache = new Map<string, HTMLCanvasElement>();
const MAX_ENTRIES = 600;

function remember(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (c) return c;
  if (cache.size >= MAX_ENTRIES) cache.clear();
  c = make();
  cache.set(key, c);
  return c;
}

/** A single character, centred in a square canvas of `size*1.4` px. */
export function glyphSprite(ch: string, color: string, size: number): HTMLCanvasElement {
  const px = Math.max(6, Math.round(size));
  return remember(`g|${ch}|${color}|${px}`, () => {
    const s = Math.ceil(px * 1.4);
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    g.font = `700 ${px}px ${MONO_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(ch, s / 2, s / 2);
    return c;
  });
}

/** Enemy bullet: hard-shadowed coloured orb, optionally with a letter. */
export function orbSprite(ch: string, fill: string, line: string, ink: string, r: number): HTMLCanvasElement {
  const rr = Math.max(2, Math.round(r));
  return remember(`o|${ch}|${fill}|${line}|${rr}`, () => {
    const R = ch ? rr + 3 : rr + 2;
    const s = (R + 4) * 2;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d')!;
    const m = s / 2;
    g.fillStyle = line;
    g.beginPath();
    g.arc(m + 2, m + 2, R, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = fill;
    g.beginPath();
    g.arc(m, m, R, 0, Math.PI * 2);
    g.fill();
    if (ch) {
      g.strokeStyle = line;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = ink;
      g.font = `800 ${Math.round(rr * 1.9)}px ${MONO_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, m, m + 1);
    } else {
      g.fillStyle = line;
      g.beginPath();
      g.arc(m, m, rr * 0.45, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  });
}
