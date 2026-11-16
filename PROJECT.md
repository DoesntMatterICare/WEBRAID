# WEBRAID — Every Website Is a Boss Fight

> A browser extension that turns any webpage into a playable arena. Headlines, images, links and buttons become enemies. The site's logo becomes the final boss. An AI boss taunts you using the page you're on.

---

## 1. Vision

The internet is the level. Click the WEBRAID icon on any site — YouTube, Amazon, Wikipedia, your school portal — and the page comes alive and attacks you. Destroy it, beat the boss, post your score, move on to the next site.

**One-line pitch:** *"Beat the internet, one website at a time."*

### Goals
| Goal | How WEBRAID hits it |
|---|---|
| **Viral** | Instantly clip-able ("I destroyed Amazon"), personalized AI taunts, per-site leaderboards, shareable victory cards |
| **Money** | Cosmetics, weapons, Rage Mode subscription, seasonal passes |
| **Wow** | Your real, familiar websites physically break apart under your fire |

### Non-goals (v1)
- No modifying websites permanently — everything resets when you exit.
- No mobile (Chrome desktop first; Edge/Brave come free since they're Chromium).
- No real-time multiplayer until v2.

---

## 2. Core Gameplay

### The loop
1. User clicks the extension icon (or presses `Alt+R`).
2. 3-second intro: screen darkens, page "wakes up", boss name revealed (e.g. **"THE YOUTUBE OVERLORD"**).
3. **Wave phase:** page elements detach and attack in waves.
4. **Boss phase:** the site logo grows, gains a health bar and attack patterns, and taunts the player.
5. **Victory / defeat screen:** score, time, accuracy, rank on this site's leaderboard, share card.
6. `Esc` at any time → page restores perfectly.

### Controls
| Input | Action |
|---|---|
| `WASD` / arrows | Move |
| Mouse | Aim |
| Left click (hold) | Shoot |
| `Space` | Dash (cooldown) |
| `E` | Special ability (charges by combo) |
| `Esc` | Quit and restore page |

### Element → Enemy mapping
| Page element | Enemy type | Behavior |
|---|---|---|
| `h1`, `h2`, `h3` | **Tank** | Slow, high HP, fires letter-bullets from its own text |
| `img`, `video`, `picture` | **Brute** | Charges at player, splits into pixel shards on death |
| `a` (links) | **Swarmer** | Small, fast, swarms in groups |
| `button`, `input` | **Turret** | Stationary, fires aimed shots |
| `iframe`, ad containers | **Toxic** | Leaves damage zones; worth bonus points ("ad-block rage") |
| `p` blocks | **Wall/cover** | Destructible cover, drops power-ups |
| Logo / site name / favicon | **BOSS** | Multi-phase fight |

### Boss detection (priority order)
1. `<img>` inside `<header>` / `[class*=logo]` / `[id*=logo]` / `[aria-label*=logo]`
2. `<svg>` inside header with link to `/`
3. `og:site_name` meta + favicon rendered large as fallback
4. Fallback: the largest `h1` becomes the boss

### Boss phases
- **Phase 1 (100–60%):** bullet patterns (spiral, fan, aimed).
- **Phase 2 (60–25%):** summons minions from remaining page elements.
- **Phase 3 (25–0%):** enraged — screen shakes, faster patterns, AI final taunt.

### Scoring
- Points per kill × combo multiplier (combo resets when hit).
- Bonus: no-damage, speed clear, accuracy, "ad slayer".
- Final rank: **S / A / B / C / D**.

### Progression
- XP and player level across all sites.
- **Site collection:** a "conquered websites" trophy map (beat 10 news sites → badge "Media Destroyer").
- Daily challenge: "Today's target: wikipedia.org — top 100 get a badge."

---

## 3. AI Boss Personality

Each boss gets a generated name, intro line and taunts based on the page.

### What is sent to the AI (minimal, privacy-safe)
- Domain (e.g. `youtube.com`)
- Page title
- Up to 5 top headings (truncated)
- Player stats from this run (deaths, accuracy, time)

**Never sent:** full page text, form contents, URLs with query strings, cookies, anything from blocked categories (see §8).

### Example output
```json
{
  "bossName": "THE ALGORITHM, DEVOURER OF HOURS",
  "intro": "You came here for one video. That was 3 hours ago.",
  "taunts": [
    "Skip ad in 5... 4... never.",
    "Your accuracy is lower than my comment section's IQ."
  ],
  "defeatLine": "Fine. But you'll be back. You always come back."
}
```

### Rules
- Model: fast, cheap model (e.g. `claude-haiku-5-5`) through our own backend — **never ship an API key inside the extension.**
- Response is **text/JSON only** — the AI never generates code that runs (also required by Chrome MV3 policy).
- Content filter: playful roasts only — no slurs, no attacks on real people, no sensitive topics. System prompt + server-side word filter.
- **Offline fallback:** a local library of ~200 template taunts with `{site}` / `{stat}` slots so the game works with no network and on free-tier rate limits.
- Cache taunts per domain for 24 h to cut cost.

---

## 4. Technical Architecture

### Overview
```
┌──────────────────────── Browser ────────────────────────┐
│                                                         │
│  Toolbar click / Alt+R                                  │
│        │                                                │
│  background (service worker)                            │
│   ├─ injects game into active tab (activeTab+scripting) │
│   ├─ talks to backend (taunts, leaderboard, auth)       │
│   └─ storage (settings, XP, unlocks)                    │
│        │                                                │
│  content script (game)                                  │
│   ├─ DOM scanner  → enemy list                          │
│   ├─ Shadow-DOM HUD + full-screen <canvas>              │
│   ├─ game engine (loop, physics, collisions, FX)        │
│   └─ restorer (undo every visual change on exit)        │
└─────────────────────────────────────────────────────────┘
              │ HTTPS
┌──────────── Backend (serverless) ────────────┐
│  /api/taunt        → Claude API (+cache)     │
│  /api/score        → validate + store score  │
│  /api/leaderboard  → per-domain top 100      │
│  /api/checkout     → payments (premium)      │
│  DB: Postgres (scores, users, unlocks)       │
│  KV cache: taunts per domain                 │
└──────────────────────────────────────────────┘
```

### Stack
| Layer | Choice | Why |
|---|---|---|
| Extension framework | **WXT** (Manifest V3, TypeScript, Vite) | Hot reload, cross-browser builds, clean MV3 setup |
| Language | **TypeScript** | Safety in a messy DOM environment |
| Rendering | **Canvas 2D**, custom tiny engine | Light (<150 KB), no Phaser overhead injected into every page |
| UI (HUD/menus) | Plain TS + CSS inside **Shadow DOM** | Website CSS can't break our UI and vice versa |
| Audio | Web Audio API, small sfx files | Low latency |
| Backend | Serverless functions (Vercel / Cloudflare Workers) | Cheap, scales to viral spikes |
| DB | Postgres (marketplace-provisioned) | Leaderboards, accounts |
| Cache | KV / Redis | Taunt cache, rate limiting |
| Auth | Anonymous device ID first; optional Google sign-in for leaderboards/purchases | Zero friction to play |
| Payments | Stripe (or ExtensionPay wrapper) | Chrome Web Store no longer handles payments |

### How the page "becomes" a level (key technique)
1. **Scan:** walk visible elements, keep those in/near the viewport with `getBoundingClientRect()` and real size (>16px). Cap at ~150 enemies.
2. **Snapshot:** for each chosen element, record its rect and capture a look:
   - text elements → render text to an offscreen canvas,
   - images → draw the `<img>` to canvas (fallback to colored block if cross-origin taints the canvas).
3. **Hide originals** by setting `visibility: hidden` (stored in a restore list) — layout doesn't shift.
4. **Overlay:** a fixed full-viewport `<canvas>` (z-index max) draws enemies at their original positions, so it looks like the page itself comes alive.
5. **Restore:** on exit, remove canvas + Shadow root and reset every saved style. Page is untouched.

Scroll is locked during a raid; the level is the current viewport.

### Performance targets
- Inject + scan + start: **< 400 ms** on a typical page.
- **60 FPS** with 150 enemies + 500 bullets on a mid laptop.
- Spatial hash grid for collisions; object pools for bullets/particles; no per-frame allocations.
- Injected bundle **< 200 KB** gzipped.

---

## 5. Project Structure

```
webraid/
├── PROJECT.md
├── package.json
├── wxt.config.ts
├── tsconfig.json
├── public/
│   ├── icons/                 # 16/32/48/128 px
│   └── sfx/                   # shoot, hit, explode, boss-roar, victory
├── src/
│   ├── entrypoints/
│   │   ├── background.ts      # injection, messaging, API calls
│   │   ├── game.content.ts    # entry for injected game (registered dynamically)
│   │   └── popup/             # small menu: play, profile, settings, shop
│   ├── game/
│   │   ├── engine/
│   │   │   ├── loop.ts        # fixed-timestep game loop
│   │   │   ├── input.ts
│   │   │   ├── collision.ts   # spatial hash
│   │   │   ├── pool.ts        # object pooling
│   │   │   └── fx.ts          # particles, screen shake, flashes
│   │   ├── dom/
│   │   │   ├── scanner.ts     # DOM → enemy specs
│   │   │   ├── boss-finder.ts # logo detection
│   │   │   ├── snapshot.ts    # elements → sprites
│   │   │   └── restorer.ts    # undo all changes
│   │   ├── entities/
│   │   │   ├── player.ts
│   │   │   ├── enemies/       # tank.ts, brute.ts, swarmer.ts, turret.ts, toxic.ts
│   │   │   ├── boss.ts
│   │   │   └── bullets.ts
│   │   ├── director.ts        # waves, difficulty, phases
│   │   ├── scoring.ts
│   │   └── ui/                # HUD, intro, victory screen, share card
│   ├── ai/
│   │   ├── taunts.ts          # fetch + cache + fallback
│   │   └── fallback-taunts.json
│   ├── shared/
│   │   ├── storage.ts         # XP, unlocks, settings
│   │   ├── blocklist.ts       # sites where WEBRAID refuses to run
│   │   └── types.ts
│   └── styles/
│       └── hud.css
├── server/
│   ├── api/
│   │   ├── taunt.ts
│   │   ├── score.ts
│   │   ├── leaderboard.ts
│   │   └── checkout.ts
│   └── lib/
│       ├── claude.ts
│       ├── filter.ts          # content moderation
│       ├── anticheat.ts
│       └── db.ts
└── tests/
    ├── scanner.test.ts
    ├── restorer.test.ts
    └── fixtures/              # saved HTML pages for testing
```

---

## 6. Permissions (keep the install warning scary-free)

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "scripting", "storage"],
  "commands": {
    "start-raid": { "suggested_key": { "default": "Alt+R" }, "description": "Start WEBRAID" }
  }
}
```

- **No `<all_urls>` host permission.** `activeTab` grants access only to the tab you click on, only at that moment → install shows *no* "read all your data" warning. Big trust + conversion win.
- No history, cookies, tabs or webRequest permissions.

---

## 7. Monetization

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | Full game, 3 ships, basic weapons, daily AI taunts (limited), leaderboards |
| **Cosmetics** | $0.99–$4.99 | Ship skins, bullet trails, explosion styles, victory animations |
| **Rage Mode** (sub) | ~$2.99/mo | Unlimited AI bosses, harder "Nightmare" difficulty, exclusive weapons, custom boss voice lines, no cooldown on daily challenge retries |
| **Season Pass** | ~$4.99/season | Themed seasons (e.g. "Social Media Siege"), reward track |

Later:
- **Creator/streamer mode:** Twitch chat votes on boss attacks (sponsorship potential).
- **Brand raids:** brands pay to be the "Boss of the Week" (opt-in marketing, clearly labeled).

**Rule:** no pay-to-win on leaderboards — paid items are cosmetic or in separate "Nightmare" boards.

---

## 8. Safety, Privacy & Store Policy

### Sites where WEBRAID refuses to start
- `chrome://`, Chrome Web Store, extension pages (blocked by Chrome anyway)
- Banking, payment and checkout pages (domain list + URL patterns like `/checkout`, `/payment`)
- Email, health portals, government ID sites
- Pages with focused password/card inputs

→ Shows a friendly message: *"This site is a safe zone. Go raid something else."*

### Privacy
- Game runs fully locally; page content never leaves the browser except the minimal AI payload in §3.
- No tracking of browsing history. Leaderboard stores only `domain + score + nickname`.
- Clear privacy policy page (required by Chrome Web Store when using remote services).
- Option to turn AI taunts off completely (offline mode).

### Chrome Web Store compliance
- **Single purpose:** "Turn the current webpage into a game." ✅
- **No remotely hosted code:** all JS is bundled; AI returns text only. ✅
- Minimal permissions with justification text ready for review. ✅

### Anti-cheat (leaderboards)
- Server validates run summaries (max possible score per enemy count, minimum run time, kill rate limits).
- Signed run token issued at raid start; scores without a valid token rejected.
- Rate limit per device; shadow-ban obvious outliers.

---

## 9. Virality Features

- **Victory card generator:** auto image — site logo smashed, rank, time, "I conquered youtube.com in 1:42 — S Rank". One-click copy/share.
- **Clip recorder (v1.1):** record the last 15 s of gameplay from the game canvas (`canvas.captureStream()` + `MediaRecorder`) → WebM download. No extra permissions needed.
- **Per-site leaderboards:** "Top raider of amazon.com" bragging rights.
- **Daily target site:** everyone raids the same site that day; creates shared conversation.
- **Challenge links:** "Beat my score on wikipedia.org" link opens the site + prompts a raid.

### Launch plan
1. Build in public: short TikTok/Shorts dev clips ("I made Google attack me").
2. Seed 10–20 gaming/tech creators with Rage Mode free.
3. Post on Reddit (r/InternetIsBeautiful, r/WebGames, r/chrome), Product Hunt, Hacker News "Show HN".
4. Daily challenge + leaderboard keeps people coming back after the novelty spike.

---

## 10. Roadmap

### v0.1 — Playable prototype (Week 1)
- [x] WXT project setup, MV3 manifest, `Alt+R` command
- [x] Inject canvas + Shadow-DOM HUD on click
- [x] DOM scanner → enemies with original positions & looks
- [x] Player movement, aiming, shooting, collisions
- [x] 3 enemy types (tank, brute, swarmer)
- [x] Perfect page restore on `Esc` / game end (verified on fixture; real-site sweep pending)
- **Done when:** you can raid 10 popular sites without breaking any of them

### v0.2 — Boss & juice (Week 2)
- [x] Boss finder + 3-phase boss
- [x] Turret & toxic enemies (power-ups still to do)
- [x] Particles, pooled polygon shards, directional + rotational screen shake, hit-stop, chromatic aberration, sound effects
- [ ] Offline taunt library (9 boss taunts so far; target ~200)
- [x] Scoring, combo, ranks, victory/defeat screens

### v0.3 — AI & online (Week 3)
- [ ] Backend: taunt endpoint with Claude + cache + filter
- [ ] Leaderboards with anti-cheat
- [ ] XP, levels, conquered-sites collection
- [x] Victory share card (offscreen-canvas battle receipt, copy/save PNG)

### v1.0 — Public launch (Week 4–5)
- [ ] Safe-zone blocklist, settings, accessibility (reduced motion, colorblind palette)
- [ ] Privacy policy, store listing, screenshots, promo video
- [ ] Chrome Web Store + Edge Add-ons submission

### v1.x — Money
- [ ] Shop + cosmetics + Stripe
- [ ] Rage Mode subscription
- [ ] Clip recorder, daily challenge, challenge links

### v2 — Big swings
- [ ] **Co-op raids:** friends on the same URL raid together in real time (WebSockets)
- [ ] Streamer mode with Twitch chat integration
- [ ] Firefox port
- [ ] Seasonal events & brand raids

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Weird pages break the scanner (SPAs, canvas apps, infinite scroll) | Test fixtures of top 50 sites; fallback "generic level" if <10 usable elements |
| Cross-origin images can't be drawn | Fallback colored blocks with the element's dominant color |
| Page restore misses something → broken site | Restore list + full reload option ("Something look off? Reload page") |
| AI costs explode if viral | 24 h domain cache, free-tier limits, offline taunts, cheap model |
| AI says something offensive | Strict system prompt, server filter, report button, kill switch for AI taunts |
| Store rejection | Minimal permissions, no remote code, clear single purpose, privacy policy |
| Novelty wears off fast | Daily target site, leaderboards, collection, seasons, co-op |
| Leaderboard cheating | Signed tokens, server validation, outlier detection |

---

## 12. Success Metrics

| Metric | Target (first 3 months) |
|---|---|
| Installs | 50,000 |
| Day-7 retention | ≥ 15% |
| Raids per active user per week | ≥ 5 |
| Share-card clicks per raid | ≥ 8% |
| Free → paid conversion | ≥ 2% |
| Store rating | ≥ 4.5 ★ |

---

## 13. Open Decisions

- [x] Art style: **web brutalism** — the game is built from the web's own materials: the page goes newsprint-grey, live elements keep colour, damage is text selection / pixel rot, dead elements leave torn holes showing their real HTML, HUD is an ultra-minimal corner-bracket readout (tabular-nums, no panels), wave banners are HTTP status codes, win screen is a 404 page with a battle-receipt share card. Cross-origin media renders as scanline ARMOR cards (+HP). Light/dark pages get matching ink. (Neon/glass was tried and rejected as generic.)
- [x] Player avatar: the mouse cursor, with pointer trails and a busy spinner while invulnerable
- [ ] Backend host: Vercel vs Cloudflare Workers
- [ ] Name check: confirm "WEBRAID" is free on Chrome Web Store, domains and socials
