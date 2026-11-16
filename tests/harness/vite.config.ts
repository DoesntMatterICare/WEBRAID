import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Dev harness: runs the game directly on fixture pages, no extension needed.
export default defineConfig({
  root: fileURLToPath(new URL('../fixtures', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  server: { port: 5178, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
});
