export const DASHBOARD_CSS = `
:root {
  --bg-base:#0A0E14; --bg-panel:#0F1520; --bg-raised:#141C28; --bg-hover:#1A2433;
  --line:#1B2230; --line-strong:#27313F;
  --txt-hi:#E6EDF3; --txt-mid:#9DA9B8; --txt-lo:#5C6775;
  --pos:#26D07C; --pos-soft:#0C1E15; --pos-line:#16402A;
  --neg:#FF5A5A; --neg-soft:#1E0C0C; --neg-line:#3A1818;
  --warn:#F5B423; --warn-soft:#1E1606; --warn-line:#3A2C0C;
  --info:#3FC8E4; --info-soft:#0C1B20; --info-line:#1E3A44;
  --accent:#7C8BFF; --accent-dim:#4A52A8;
  --r-sm:4px; --r-md:6px; --r-lg:10px;
  --shadow-bar:0 1px 0 #00000040, 0 6px 18px -12px #000000;
  --font-mono:"JetBrains Mono","IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --font-sans:"Inter","Inter var",-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
}
* { box-sizing:border-box; }
html,body { margin:0; background:var(--bg-base); color:var(--txt-hi); }
body { font-family:var(--font-mono); font-variant-numeric:tabular-nums; font-size:12px; line-height:1.5; -webkit-font-smoothing:antialiased; }
.sans { font-family:var(--font-sans); }
.mono { font-family:var(--font-mono); }
a { color:var(--accent); text-decoration:none; }

.topbar {
  position:sticky; top:0; z-index:10; display:flex; align-items:center; gap:14px;
  height:44px; padding:0 16px; background:var(--bg-panel); border-bottom:1px solid var(--line);
  box-shadow:var(--shadow-bar);
}
.brand { font-weight:500; letter-spacing:0.04em; color:var(--txt-hi); white-space:nowrap; }
.brand b { color:var(--accent); }
.spacer { flex:1 1 auto; }
.pulse-dot { width:8px; height:8px; border-radius:50%; background:var(--pos); box-shadow:0 0 0 0 var(--pos); }
.pulse-dot.live { animation:breathe 600ms ease-out; }
.pulse-dot.stale { background:var(--warn); }
.pulse-dot.fail { background:var(--neg); }
@keyframes breathe { 0%{opacity:1;} 50%{opacity:0.4;} 100%{opacity:1;} }
.topbar .meta { color:var(--txt-lo); font-size:11px; white-space:nowrap; }
.topbar .verdict-word { font-weight:500; letter-spacing:0.02em; }

.pill {
  display:inline-flex; align-items:center; gap:5px; padding:2px 9px; border-radius:999px;
  font-size:11px; font-weight:500; border:1px solid var(--line-strong); color:var(--txt-mid); background:var(--bg-raised);
}
.pill.pos { color:var(--pos); background:var(--pos-soft); border-color:var(--pos-line); }
.pill.neg { color:var(--neg); background:var(--neg-soft); border-color:var(--neg-line); }
.pill.warn { color:var(--warn); background:var(--warn-soft); border-color:var(--warn-line); }
.pill.info { color:var(--info); background:var(--info-soft); border-color:var(--info-line); }
.pill.mute { color:var(--txt-lo); }

.grid { display:grid; grid-template-columns:repeat(12,1fr); gap:12px; padding:12px; align-items:start; }
.panel { background:var(--bg-panel); border:1px solid var(--line); border-radius:var(--r-lg); padding:13px; min-width:0; }
.panel-label { font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:var(--txt-lo); }
.panel-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:11px; }
.panel-head .aux { font-size:11px; color:var(--txt-lo); }

.hero { grid-column:span 4; grid-row:span 2; display:flex; flex-direction:column; gap:13px; }
.panel-doctor { grid-column:span 4; }
.panel-watchlist { grid-column:span 4; }
.panel-candidates { grid-column:span 8; }
.panel-calibration { grid-column:span 4; }
.panel-smoke { grid-column:span 6; }
.panel-timeline { grid-column:span 6; }
.eval-strip { grid-column:span 12; }

.hero-verdict { font-size:42px; font-weight:500; letter-spacing:-0.02em; line-height:1.05; }
.hero.is-ok .hero-verdict { color:var(--pos); }
.hero.is-warn .hero-verdict { color:var(--warn); }
.hero.is-error .hero-verdict { color:var(--neg); }
.verdict-word.is-ok { color:var(--pos); }
.verdict-word.is-warn { color:var(--warn); }
.verdict-word.is-error { color:var(--neg); }
.hero-sub { color:var(--txt-mid); font-size:12px; }
.proportion-bar { display:flex; height:6px; border-radius:999px; overflow:hidden; background:var(--bg-raised); }
.proportion-bar > span { display:block; height:100%; }
.proportion-bar .seg-ok { background:var(--pos); }
.proportion-bar .seg-warn { background:var(--warn); }
.proportion-bar .seg-err { background:var(--neg); }
.hero-reasons { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:5px; }
.hero-reasons li { font-size:11px; color:var(--txt-mid); display:flex; gap:7px; }
.hero-reasons li .g { flex:0 0 auto; }
.stat-tiles { display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-top:auto; }
.stat-tile { background:var(--bg-raised); border:1px solid var(--line); border-radius:var(--r-md); padding:9px 11px; }
.stat-tile .k { font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:var(--txt-lo); }
.stat-tile .v { font-size:18px; font-weight:500; margin-top:3px; }
.stat-tile .v.pos { color:var(--pos); } .stat-tile .v.warn { color:var(--warn); } .stat-tile .v.neg { color:var(--neg); }

.rows { display:flex; flex-direction:column; }
.drow { display:flex; align-items:center; gap:9px; padding:5px 0; border-bottom:1px solid var(--line); }
.drow:last-child { border-bottom:0; }
.glyph { flex:0 0 auto; width:14px; text-align:center; font-size:12px; }
.glyph.pos { color:var(--pos); } .glyph.warn { color:var(--warn); } .glyph.neg { color:var(--neg); } .glyph.info { color:var(--info); } .glyph.mute { color:var(--txt-lo); }
.drow.fail { background:linear-gradient(90deg,var(--neg-soft),transparent 60%); margin:0 -7px; padding-left:7px; padding-right:7px; border-radius:var(--r-sm); }
.drow .name { color:var(--txt-hi); flex:0 0 auto; }
.drow .detail { color:var(--txt-lo); font-size:11px; margin-left:auto; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60%; }

.wl-pills { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.review-list { display:flex; flex-direction:column; gap:6px; }
.review-row { display:flex; align-items:center; gap:8px; font-size:11px; }
.review-row .code { color:var(--txt-hi); } .review-row .nm { color:var(--txt-mid); }
.review-row .due { margin-left:auto; color:var(--txt-lo); }
.review-row .due.overdue { color:var(--warn); }

.tbl-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
table.tbl { width:100%; border-collapse:collapse; font-size:12px; }
table.tbl th { text-align:left; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:var(--txt-lo); font-weight:500; padding:4px 8px; border-bottom:1px solid var(--line-strong); }
table.tbl td { padding:6px 8px; border-bottom:1px solid var(--line); white-space:nowrap; }
table.tbl tr:last-child td { border-bottom:0; }
table.tbl tr:hover td { background:var(--bg-hover); }
td.num { text-align:right; }
td.rank { color:var(--txt-lo); }
td.score { font-weight:500; }
.score.b1 { color:var(--pos); } .score.b2 { color:var(--info); } .score.b3 { color:var(--warn); } .score.b4 { color:var(--txt-lo); }
.conf-low { color:var(--warn); } .conf-medium { color:var(--info); } .conf-high { color:var(--pos); }
.bucket-core { color:var(--pos); } .bucket-watchlist { color:var(--info); } .bucket-observe { color:var(--txt-mid); } .bucket-reject { color:var(--txt-lo); }

.histogram { display:flex; align-items:flex-end; gap:8px; height:64px; margin:8px 0; }
.histo-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; }
.histo-bar { width:100%; background:var(--accent-dim); border-radius:3px 3px 0 0; min-height:2px; }
.histo-bar.lead { background:var(--accent); }
.histo-k { font-size:10px; color:var(--txt-lo); }
.histo-v { font-size:11px; color:var(--txt-mid); }
.churn { font-size:12px; margin:8px 0; }
.churn .up { color:var(--pos); } .churn .down { color:var(--neg); } .churn .keep { color:var(--txt-mid); }
.chips { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
.chip { font-size:10px; color:var(--txt-mid); background:var(--bg-raised); border:1px solid var(--line); border-radius:var(--r-sm); padding:2px 7px; }
.chip .ct { color:var(--txt-lo); }

.eval-strip.ok { display:none; }
.eval-strip .panel-label { color:var(--neg); }

.smoke-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:6px; }
.smoke-chip { display:flex; align-items:center; gap:7px; padding:7px 9px; background:var(--bg-raised); border:1px solid var(--line); border-radius:var(--r-md); }
.smoke-chip .lbl { font-size:11px; color:var(--txt-mid); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.smoke-chip .st { margin-left:auto; font-size:10px; color:var(--txt-lo); }

.timeline { display:flex; align-items:center; gap:0; overflow-x:auto; padding:14px 2px 8px; }
.tl-node { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; gap:6px; position:relative; min-width:64px; }
.tl-dot { width:11px; height:11px; border-radius:50%; border:2px solid var(--bg-panel); }
.tl-dot.pos { background:var(--pos); } .tl-dot.warn { background:var(--warn); } .tl-dot.neg { background:var(--neg); } .tl-dot.mute { background:var(--txt-lo); }
.tl-conn { flex:1 1 auto; height:2px; background:var(--line-strong); min-width:10px; }
.tl-kind { font-size:9px; color:var(--txt-lo); text-transform:uppercase; letter-spacing:0.04em; }
.tl-age { font-size:9px; color:var(--txt-mid); }
.tl-new { animation:slidein 300ms ease-out; }
@keyframes slidein { from{opacity:0; transform:translateX(8px);} to{opacity:1; transform:none;} }

.flash-pos, .flash-neg, .flash-warn { position:relative; }
.flash-pos::after, .flash-neg::after, .flash-warn::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; animation:flashfade 470ms ease-out; }
.flash-pos::after { background:var(--pos-soft); }
.flash-neg::after { background:var(--neg-soft); }
.flash-warn::after { background:var(--warn-soft); }
@keyframes flashfade { from{opacity:1;} to{opacity:0;} }
.nudge { animation:nudge 250ms ease-out; }
@keyframes nudge { 0%{transform:scale(1);} 50%{transform:scale(1.03);} 100%{transform:scale(1);} }

.footer { padding:6px 16px 20px; color:var(--txt-lo); font-size:10px; display:flex; flex-wrap:wrap; gap:14px; }
.footer .warn { color:var(--warn); }
.empty { color:var(--txt-lo); font-size:11px; padding:6px 0; }

@media (max-width:1400px) {
  .grid { grid-template-columns:repeat(6,1fr); }
  .hero { grid-column:span 6; grid-row:auto; }
  .panel-doctor, .panel-watchlist, .panel-calibration { grid-column:span 3; }
  .panel-candidates, .panel-smoke, .panel-timeline, .eval-strip { grid-column:span 6; }
  .stat-tiles { grid-template-columns:repeat(4,1fr); }
}
@media (max-width:880px) {
  .grid { grid-template-columns:1fr; }
  .hero, .panel-doctor, .panel-watchlist, .panel-candidates, .panel-calibration, .panel-smoke, .panel-timeline, .eval-strip { grid-column:span 1; }
  .stat-tiles { grid-template-columns:1fr 1fr; }
  .topbar { gap:8px; overflow-x:auto; }
}
@media (prefers-reduced-motion: reduce) {
  .pulse-dot.live, .nudge, .tl-new { animation:none !important; }
  .flash-pos::after, .flash-neg::after, .flash-warn::after { display:none !important; }
}
`;
