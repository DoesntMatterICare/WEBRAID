# WEBRAID

Every website is a boss fight. See [PROJECT.md](PROJECT.md) for the full design.

## Status: v0.1 playable prototype

- MV3 extension (WXT + TypeScript), permissions: `activeTab`, `scripting`, `storage` — no host permissions.
- Toolbar click or `Alt+R` injects the game into the current tab; click again / `Esc` restores the page exactly.
- DOM scanner turns images/videos → **brutes**, `h1–h3` → **tanks** (fire letter-bullets from their own text), links → **swarmers**.
- Canvas overlay + closed Shadow-DOM HUD, fixed-timestep loop, spatial hash, pooled bullets/particles, sprite shattering.
- Safe-zone blocklist (banking, payments, email, gov/health, sign-in, checkout paths, focused password/card inputs).

## Develop

```bash
npm install
npm run dev        # WXT dev mode: opens Chrome with the extension loaded + hot reload
npm run build      # production build -> .output/chrome-mv3
npm run harness    # play on tests/fixtures/index.html at http://localhost:5178 without the extension
npm run compile    # typecheck
```

Load the build manually: `chrome://extensions` → Developer mode → **Load unpacked** → `.output/chrome-mv3`.

## Controls

`WASD`/arrows move · mouse aim · hold left click fire · `Space` dash · `Esc` quit · `R` raid again (end screen)
