// Ultra-minimal corner-bracket HUD + intro + error-page end screen.
// Lives inside a closed shadow root (see hud.ts). Theme follows the page.
export const HUD_CSS = /* css */ `
:host {
  all: initial;
  --ink: #0d0d10; --paper: #f3f1ea; --select: #2f6bff; --link: #2a3cff;
  --marker: #ffe14d; --error: #ff3131; --ok: #13b26b;
  --fg: #0d0d10; --halo: rgba(243,241,234,.92); --muted: #55545c; --surface: #f3f1ea;
  --ui: "Inter Tight", Inter, "Segoe UI Variable Display", "Segoe UI", "SF Pro Display", system-ui, sans-serif;
  --heavy: "Inter Tight", "Segoe UI Black", "Arial Black", "Helvetica Neue", system-ui, sans-serif;
  --mono: "JetBrains Mono", "Cascadia Code", "SF Mono", ui-monospace, Consolas, monospace;
  --pop: cubic-bezier(.2,1.4,.3,1);
  --ease: cubic-bezier(.2,.9,.2,1);
}
:host([data-theme="dark"]) {
  --fg: #f3f1ea; --halo: rgba(13,13,16,.9); --muted: #a3a1aa; --surface: #0d0d10; --link: #6d8bff;
}
* { box-sizing: border-box; }
.desat {
  position: absolute; inset: 0; pointer-events: none; opacity: 0;
  backdrop-filter: grayscale(1) contrast(1.08) brightness(.96);
  -webkit-backdrop-filter: grayscale(1) contrast(1.08) brightness(.96);
  transition: opacity .9s var(--ease);
}
.desat.on { opacity: 1; }
.stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: none; touch-action: none; }

.corner, .boss, .hints, .banner, .overlay {
  position: absolute; pointer-events: none; color: var(--fg); font-family: var(--mono);
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
}

/* ---------- corners ---------- */
.corner {
  padding: 12px 16px; min-width: 150px;
  text-shadow: 0 0 3px var(--halo), 0 0 6px var(--halo), 0 0 10px var(--halo);
  opacity: 0; transition: opacity .4s var(--ease), transform .45s var(--pop);
}
.corner.show { opacity: 1; transform: none; }
.corner::before {
  content: ""; position: absolute; width: 22px; height: 22px; border: 0 solid var(--fg);
  filter: drop-shadow(0 0 2px var(--halo));
}
.tl { top: 14px; left: 14px; transform: translate(-8px, -8px); }
.tl::before { top: 0; left: 0; border-top-width: 2px; border-left-width: 2px; }
.tr { top: 14px; right: 14px; text-align: right; transform: translate(8px, -8px); }
.tr::before { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px; }
.bl { bottom: 14px; left: 14px; transform: translate(-8px, 8px); }
.bl::before { bottom: 0; left: 0; border-bottom-width: 2px; border-left-width: 2px; }
.br { bottom: 14px; right: 14px; text-align: right; transform: translate(8px, 8px); }
.br::before { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px; }

.row { display: flex; align-items: center; gap: 10px; margin: 3px 0; }
.tr .row, .br .row { justify-content: flex-end; }
.label { font: 700 10px/1 var(--mono); letter-spacing: .18em; color: var(--muted); }
.val { font: 800 13px/1 var(--mono); }
.val.muted { color: var(--muted); }
.big { font: 900 30px/1.05 var(--mono); letter-spacing: -.02em; margin-top: 4px; }
.pips { display: flex; gap: 4px; }
.pip { width: 16px; height: 8px; border: 2px solid var(--fg); background: transparent; }
.pip.on { background: var(--fg); }
.tl.critical .pip.on { background: var(--error); border-color: var(--error); animation: blink .6s steps(2) infinite; }
.combo { min-height: 16px; margin-top: 4px; font: 800 12px/1 var(--mono); color: var(--ink); }
.combo:not(:empty) { display: inline-block; background: var(--marker); padding: 3px 6px; text-shadow: none; }
.combo.bump { animation: bump .28s var(--pop); }
.dash { width: 84px; height: 4px; background: color-mix(in srgb, var(--fg) 20%, transparent); }
.dash-fill { height: 100%; background: var(--muted); transform-origin: left; }
.dash-fill.ready { background: var(--select); }
.site { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-bottom: 4px; font: 800 12px/1 var(--mono); }
.domain { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fav { display: inline-flex; width: 14px; height: 14px; flex: none; overflow: hidden; background: var(--fg); }
.fav img { width: 100%; height: 100%; object-fit: cover; background: #fff; }

/* ---------- boss bar ---------- */
.boss {
  top: 16px; left: 50%; width: min(520px, calc(100vw - 420px)); min-width: 260px; padding: 8px 14px 12px;
  transform: translate(-50%, -140%); transition: transform .5s var(--pop);
  text-shadow: 0 0 3px var(--halo), 0 0 8px var(--halo);
}
.boss.show { transform: translate(-50%, 0); }
.boss::before, .boss::after { content: ""; position: absolute; top: 0; bottom: 0; width: 10px; border: 2px solid var(--fg); }
.boss::before { left: 0; border-right: 0; }
.boss::after { right: 0; border-left: 0; }
.boss-head { display: flex; justify-content: space-between; gap: 12px; font: 900 13px/1.2 var(--mono); letter-spacing: .06em; }
.boss-phase { color: var(--muted); }
.boss.enraged .boss-phase { color: var(--error); animation: blink .5s steps(2) infinite; }
.boss-bar { position: relative; height: 8px; margin-top: 6px; background: color-mix(in srgb, var(--fg) 15%, transparent); }
.boss-fill, .boss-lag { position: absolute; inset: 0; transform-origin: left; }
.boss-lag { background: var(--marker); transition: transform .7s var(--ease) .25s; }
.boss-fill { background: var(--error); transition: transform .1s linear; }

/* ---------- hints ---------- */
.hints {
  left: 50%; bottom: 18px; transform: translateX(-50%); white-space: nowrap;
  font: 600 11px/1 var(--mono); color: var(--muted); letter-spacing: .04em;
  text-shadow: 0 0 3px var(--halo), 0 0 8px var(--halo);
  opacity: 0; transition: opacity .8s var(--ease);
}
.hints.show { opacity: 1; }

/* ---------- wave banner ---------- */
.banner { left: 0; right: 0; top: 34%; display: flex; flex-direction: column; align-items: center; opacity: 0; }
.banner.show { animation: slam 1.8s var(--ease) forwards; }
.banner-main {
  font: 900 clamp(46px, 7vw, 96px)/1 var(--heavy); letter-spacing: -.04em; text-transform: uppercase;
  background: var(--ink); color: #fff; padding: 6px 22px 10px; transform: rotate(-2deg);
  box-shadow: 8px 8px 0 var(--select);
}
.banner-sub {
  margin-top: 14px; font: 800 14px/1 var(--mono); letter-spacing: .06em; color: var(--ink);
  background: var(--marker); padding: 6px 10px; border: 2px solid var(--ink); transform: rotate(1.5deg);
}

/* ---------- intro ---------- */
.overlay { inset: 0; display: none; }
.overlay.show { display: block; }
.overlay.leaving { animation: out .4s var(--ease) forwards; }
.log {
  position: absolute; left: 24px; top: 24px; width: min(460px, calc(100vw - 48px));
  padding: 14px 16px; background: #0d0d10; color: #d7d7de; border: 2px solid var(--fg);
  box-shadow: 6px 6px 0 var(--select); font: 500 13px/1.7 var(--mono);
  animation: drop .45s var(--pop) both;
}
.line { white-space: nowrap; overflow: hidden; opacity: 0; animation: type .35s steps(24) both; }
.line.req { color: #fff; font-weight: 700; }
.line.req::before { content: "\\2192  "; color: var(--marker); }
.line.res::before { content: "\\2190  "; color: #6f6f7a; }
.line.ok { color: #6ee7a8; }
.line.warn { color: var(--error); font-weight: 800; }
.intro-title { position: absolute; left: 24px; right: 24px; bottom: 12vh; }
.intro-kicker {
  display: inline-block; font: 800 13px/1 var(--mono); letter-spacing: .2em; background: var(--error); color: #fff;
  padding: 6px 10px; border: 2px solid var(--ink); animation: drop .4s var(--pop) .9s both;
}
.intro-domain {
  display: block; margin-top: 8px; font: 900 clamp(48px, 11vw, 168px)/.9 var(--heavy); letter-spacing: -.05em;
  color: var(--fg); overflow-wrap: anywhere; text-shadow: 6px 6px 0 var(--marker);
  animation: rise .6s var(--pop) 1.05s both;
}
.intro-keys {
  position: absolute; left: 24px; bottom: 5vh; display: flex; gap: 16px; flex-wrap: wrap;
  font: 600 12px/1 var(--mono); color: var(--fg); text-shadow: 0 0 4px var(--halo);
  animation: rise .5s var(--ease) 1.5s both;
}
.hint { display: inline-flex; align-items: center; gap: 6px; }
kbd {
  display: inline-block; padding: 3px 5px; border: 1.5px solid #0d0d10; border-bottom-width: 3px; border-radius: 3px;
  background: #fff; font: 800 9px/1 var(--mono); color: #0d0d10; text-shadow: none;
}

/* ---------- error page + receipt (end) ---------- */
.overlay.end { pointer-events: auto; background: color-mix(in srgb, var(--surface) 95%, transparent); animation: wipe .5s var(--ease) both; overflow: auto; }
.errpage {
  min-height: 100%; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, 0.75fr);
  align-items: center; gap: 4vw; padding: 5vh 5vw;
}
.code {
  font: 900 clamp(110px, 19vw, 300px)/.8 var(--heavy); letter-spacing: -.07em; color: var(--fg);
  text-shadow: 10px 10px 0 var(--error); animation: rise .6s var(--pop) .05s both;
}
.lose .code { text-shadow: 10px 10px 0 var(--select); }
.err-site { display: flex; align-items: center; gap: 8px; margin-top: 18px; font: 700 13px/1 var(--mono); }
.err-title { margin: 12px 0 6px; font: 900 clamp(26px, 3vw, 44px)/1.02 var(--heavy); letter-spacing: -.03em; color: var(--fg); }
.err-sub { margin: 0; font: 500 16px/1.4 var(--ui); color: var(--muted); }
.headers {
  margin: 18px 0 0; padding: 12px 14px; background: #0d0d10; color: #c9c9d1; border: 2px solid var(--fg);
  box-shadow: 6px 6px 0 var(--marker); font: 500 13px/1.7 var(--mono); white-space: pre-wrap; font-variant-numeric: tabular-nums;
}
.hrow { display: block; animation: type .3s steps(20) both; }
.hrow b { color: #8fa8ff; font-weight: 700; }
.hrow.status b, .hrow.status span { color: #fff; font-weight: 800; }
.buttons { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
.btn {
  all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 18px; border: 2px solid #0d0d10; border-radius: 6px; background: #fff;
  font: 800 15px/1 var(--ui); color: #0d0d10; box-shadow: 4px 4px 0 var(--fg);
  transition: transform .08s, box-shadow .08s;
}
.btn.small { padding: 9px 12px; font-size: 13px; }
.btn:hover { transform: translate(-1px, -1px); box-shadow: 5px 5px 0 var(--fg); }
.btn:active { transform: translate(3px, 3px); box-shadow: 1px 1px 0 var(--fg); }
.btn:focus-visible { outline: 3px solid var(--select); outline-offset: 3px; }
.btn.primary { background: var(--select); color: #fff; }
.btn.primary kbd { background: rgba(255,255,255,.9); }
.share { display: flex; flex-direction: column; align-items: center; gap: 12px; animation: rise .6s var(--pop) .4s both; }
.receipt { width: min(100%, 340px); height: auto; max-height: 82vh; object-fit: contain; display: block; transform: rotate(1.5deg); }
.share-actions { display: flex; gap: 10px; }

/* ---------- motion ---------- */
@keyframes blink { 50% { opacity: .35; } }
@keyframes bump { 0% { transform: scale(1.3); } 100% { transform: none; } }
@keyframes slam {
  0% { opacity: 0; transform: scale(1.6); }
  12% { opacity: 1; transform: scale(.96); }
  18% { transform: none; }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-14px); }
}
@keyframes type { from { opacity: 1; max-width: 0; } to { opacity: 1; max-width: 100%; } }
@keyframes drop { from { opacity: 0; transform: translateY(-16px); } }
@keyframes rise { from { opacity: 0; transform: translateY(40px); } }
@keyframes out { to { opacity: 0; } }
@keyframes wipe { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); } }

@media (max-width: 860px) {
  .errpage { grid-template-columns: 1fr; }
  .boss { width: calc(100vw - 40px); top: 110px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;
