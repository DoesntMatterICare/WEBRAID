// Serves PNGs from a second origin (http://127.0.0.1:5180) WITHOUT CORS headers,
// so pages on the harness (localhost:5178) get genuinely tainted images.
// Used by tests/fixtures/stress.html to exercise the armor path.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const png = readFileSync(new URL('../../public/icons/128.png', import.meta.url));
createServer((req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.end(png);
}).listen(5180, '127.0.0.1', () => console.log('cross-origin images on http://127.0.0.1:5180'));
