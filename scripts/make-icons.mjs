// Generates public/icons/{16,32,48,128}.png (neon crosshair) with no dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [13, 2, 33];
const MAGENTA = [255, 43, 214];
const CYAN = [45, 226, 230];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const cover = (d, aa) => Math.max(0, Math.min(1, 0.5 - d / aa));

function pixel(x, y, s) {
  const u = (x / s) * 2 - 1;
  const v = (y / s) * 2 - 1;
  const aa = 2 / s * 1.2;
  // rounded-square plate
  const q = Math.max(Math.abs(u), Math.abs(v));
  const rr = 0.28;
  const dx = Math.max(Math.abs(u) - (1 - rr), 0);
  const dy = Math.max(Math.abs(v) - (1 - rr), 0);
  const plate = Math.hypot(dx, dy) - rr + (q > 1 - rr ? 0 : 0);
  const alpha = cover(plate + 0.02, aa);
  if (alpha <= 0) return [0, 0, 0, 0];
  let col = BG;
  const r = Math.hypot(u, v);
  const thick = Math.max(0.09, 2.2 / s);
  const ring = Math.abs(r - 0.58) - thick;
  col = mix(col, MAGENTA, cover(ring, aa));
  const gap = r > 0.2;
  const bar = Math.min(Math.abs(u), Math.abs(v)) - thick * 0.75;
  if (gap && r < 0.86) col = mix(col, CYAN, cover(bar, aa));
  col = mix(col, CYAN, cover(r - Math.max(0.1, 1.6 / s), aa));
  return [...col, Math.round(alpha * 255)];
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(`public/icons/${size}.png`, png(size, pixel));
console.log('icons written to public/icons');
