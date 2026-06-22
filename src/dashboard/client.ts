export const DASHBOARD_CLIENT_JS = String.raw`
const POLL_MS = 10000;
const prevValues = {};
let prevLevel = null;
let prevHistoryLen = -1;
let lastGood = null;

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtAge(hours) {
  if (hours == null || isNaN(hours)) return "—";
  if (hours < 1) return Math.max(0, Math.round(hours * 60)) + "m";
  if (hours < 48) return hours.toFixed(1) + "h";
  return (hours / 24).toFixed(1) + "d";
}
function fmtClock(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}
function scoreBand(score) {
  if (score >= 70) return "b1";
  if (score >= 55) return "b2";
  if (score >= 40) return "b3";
  return "b4";
}
function levelClass(level) {
  return level === "ok" ? "is-ok" : level === "warn" ? "is-warn" : "is-error";
}
function verdictWord(level) {
  return level === "ok" ? "运行正常" : level === "warn" ? "需要关注" : "存在问题";
}
function pill(cls, text) {
  return '<span class="pill ' + cls + '">' + esc(text) + "</span>";
}

function renderHero(s) {
  const h = s.health;
  const c = s.doctor.counts;
  // Partition the bar so the three segments always sum to 100%: passing, failing-warning, failing-error.
  const total = c.total || 1;
  const failErr = (s.doctor.failing || []).filter((f) => f.severity === "error").length;
  const okPct = c.ok / total * 100;
  const errPct = failErr / total * 100;
  const warnPct = Math.max(0, 100 - okPct - errPct);
  const segs = c.total > 0
    ? '<span class="seg-ok" style="width:' + okPct.toFixed(2) + '%"></span>' +
      '<span class="seg-warn" style="width:' + warnPct.toFixed(2) + '%"></span>' +
      '<span class="seg-err" style="width:' + errPct.toFixed(2) + '%"></span>'
    : "";
  const reasons = (h.reasons || []).slice(0, 4).map((r) => '<li><span class="g">›</span><span>' + esc(r) + "</span></li>").join("");
  const evals = s.evals ? s.evals.passed + "/" + s.evals.total : "—";
  const evalCls = s.evals && s.evals.passed < s.evals.total ? "neg" : "pos";
  const runAge = s.latestRun ? fmtAge(s.latestRun.ageHours) : "—";
  const runCls = s.latestRun && s.latestRun.stale ? "warn" : "";
  const wlAge = fmtAge(s.watchlist.ageHours);
  const wlCls = s.watchlist.stale ? "warn" : "";
  const smoke = s.ffdSmoke ? (s.ffdSmoke.ok ? "正常" : "异常") : "—";
  const smokeCls = s.ffdSmoke ? (s.ffdSmoke.ok ? "pos" : "neg") : "";
  return (
    '<div class="hero panel ' + levelClass(h.level) + '">' +
    '<div class="panel-label">系统健康</div>' +
    '<div class="hero-verdict" id="verdict">' + esc(verdictWord(h.level)) + "</div>" +
    '<div class="hero-sub">' + esc(s.doctor.counts.ok) + "/" + esc(s.doctor.counts.total) + " 项体检通过 · " + esc(h.headline) + "</div>" +
    '<div class="proportion-bar">' + segs + "</div>" +
    '<ul class="hero-reasons">' + reasons + "</ul>" +
    '<div class="stat-tiles">' +
      tile("最新筛选", runAge, runCls, "run") +
      tile("观察清单", wlAge, wlCls, "wl") +
      tile("安全评测", evals, evalCls, "evals") +
      tile("FFD 数据面", smoke, smokeCls, "smoke") +
    "</div>" +
    "</div>"
  );
}
function tile(k, v, cls, key) {
  const num = parseFloat(v);
  const fv = isNaN(num) ? "" : ' data-fk="tile-' + key + '" data-fv="' + num + '"';
  return '<div class="stat-tile"><div class="k">' + esc(k) + '</div><div class="v ' + cls + '"' + fv + ">" + esc(v) + "</div></div>";
}

function severityGlyph(check) {
  if (check.ok) return '<span class="glyph pos">●</span>';
  if (check.severity === "error") return '<span class="glyph neg">✕</span>';
  if (check.severity === "warning") return '<span class="glyph warn">▲</span>';
  return '<span class="glyph info">●</span>';
}
function renderDoctor(s) {
  const order = { error: 0, warning: 1, info: 2 };
  const checks = (s.doctor.checks || []).slice().sort((a, b) => (a.ok - b.ok) || (order[a.severity] - order[b.severity]));
  const rows = checks.map((c) =>
    '<div class="drow' + (!c.ok && c.severity === "error" ? " fail" : "") + '">' +
    severityGlyph(c) + '<span class="name sans">' + esc(c.name) + "</span>" +
    '<span class="detail sans">' + esc(c.detail) + "</span></div>"
  ).join("") || '<div class="empty">暂无体检数据</div>';
  return panel("panel-doctor", "运行体检", esc(s.doctor.counts.ok) + "/" + esc(s.doctor.counts.total), '<div class="rows">' + rows + "</div>");
}

function renderWatchlist(s) {
  const sc = s.watchlist.statusCounts || {};
  const map = [
    ["validated", "pos", "已验证"], ["investigating", "info", "研究中"],
    ["evidence-needed", "warn", "缺证据"], ["downgraded", "neg", "已降级"], ["archived", "mute", "已归档"],
  ];
  const pills = map.map(([k, cls, label]) => pill(cls, label + " " + (sc[k] || 0))).join(" ");
  const reviews = (s.watchlist.upcomingReviews || []).map((r) =>
    '<div class="review-row"><span class="code mono">' + esc(r.code) + '</span><span class="nm sans">' + esc(r.name) + "</span>" +
    '<span class="due' + (r.overdue ? " overdue" : "") + '">' + esc((r.nextReviewAt || "").slice(0, 10)) + "</span></div>"
  ).join("") || '<div class="empty">暂无待复盘项</div>';
  const body =
    '<div class="wl-pills">' + pills + "</div>" +
    '<div class="panel-label" style="margin-bottom:7px">待复盘 · 共 ' + esc(s.watchlist.total) + " 只 · P0 " + esc(s.watchlist.withCandidateP0) + "</div>" +
    '<div class="review-list">' + reviews + "</div>";
  return panel("panel-watchlist", "观察清单", "", body);
}

function renderCandidates(s) {
  if (!s.latestRun) return panel("panel-candidates", "最新筛选候选", "无报告", '<div class="empty">尚未生成筛选报告，运行 npm run screen。</div>');
  const r = s.latestRun;
  const q = r.quant;
  const aux = esc(r.runId) + " · " + fmtAge(r.ageHours) + (q ? " · " + esc(q.riskMode) : "");
  const rows = (r.topCandidates || []).map((c) =>
    "<tr>" +
    '<td class="rank">' + esc(c.rank) + "</td>" +
    '<td class="mono">' + esc(c.code) + "</td>" +
    '<td class="sans">' + esc(c.name) + "</td>" +
    '<td class="num score ' + scoreBand(c.score) + '" data-fk="cand-' + esc(c.code) + '" data-fv="' + c.score + '">' + c.score.toFixed(1) + "</td>" +
    '<td class="conf-' + esc(c.confidence) + '">' + esc(c.confidence) + "</td>" +
    '<td class="bucket-' + esc(c.quantBucket || "") + '">' + esc(c.quantBucket || "—") + "</td>" +
    "</tr>"
  ).join("") || '<tr><td colspan="6" class="empty">本次运行没有候选。</td></tr>';
  const buckets = q ? Object.entries(q.bucketCounts).map(([k, v]) => k + "=" + v).join(" · ") : "";
  const table =
    '<div class="tbl-scroll"><table class="tbl"><thead><tr><th>#</th><th>代码</th><th>名称</th><th class="num">评分</th><th>置信</th><th>量化分桶</th></tr></thead><tbody>' +
    rows + "</tbody></table></div>" +
    (buckets ? '<div class="panel-label" style="margin-top:9px">分桶 ' + esc(buckets) + " · 扫描 " + esc(r.totalStocksScanned) + " · 来源 " + esc(r.sourceCount) + "</div>" : "");
  return panel("panel-candidates", "最新筛选候选", aux, table);
}

function renderCalibration(s) {
  if (!s.calibration) return panel("panel-calibration", "校准", "", '<div class="empty">暂无校准快照。</div>');
  const c = s.calibration;
  const dist = c.scoreDistribution || {};
  const keys = Object.keys(dist);
  const max = Math.max(1, ...keys.map((k) => dist[k]));
  const lead = keys.reduce((a, b) => (dist[b] > (dist[a] || 0) ? b : a), keys[0]);
  const histo = keys.map((k) =>
    '<div class="histo-col"><div class="histo-v">' + esc(dist[k]) + "</div>" +
    '<div class="histo-bar' + (k === lead ? " lead" : "") + '" style="height:' + (dist[k] / max * 100).toFixed(1) + '%"></div>' +
    '<div class="histo-k">' + esc(k) + "</div></div>"
  ).join("");
  const gaps = (c.recurringCoverageGaps || []).slice(0, 5).map((g) =>
    '<span class="chip">' + esc(g.gap) + ' <span class="ct">×' + esc(g.count) + "</span></span>"
  ).join("");
  const body =
    '<div class="histogram">' + histo + "</div>" +
    '<div class="churn">候选流转 <span class="up">+' + esc(c.churn.entered) + '</span> / <span class="down">-' + esc(c.churn.exited) + '</span> / <span class="keep">' + esc(c.churn.retained) + " 留存</span></div>" +
    '<div class="panel-label" style="margin-top:6px">高频覆盖缺口</div><div class="chips">' + (gaps || '<span class="empty">无</span>') + "</div>";
  return panel("panel-calibration", "校准 · 分布", esc(c.reportsAnalyzed) + " 份报告", body);
}

function renderEvals(s) {
  if (!s.evals || s.evals.passed >= s.evals.total) return "";
  const rows = s.evals.failing.map((f) =>
    '<div class="drow fail"><span class="glyph neg">✕</span><span class="name mono">' + esc(f.id) + '</span><span class="detail sans">' + esc(f.detail) + "</span></div>"
  ).join("");
  return '<section class="panel eval-strip"><div class="panel-head"><span class="panel-label">回答安全评测未通过 ' + esc(s.evals.passed) + "/" + esc(s.evals.total) + '</span></div><div class="rows">' + rows + "</div></section>";
}

function smokeGlyph(p) {
  if (p.ok) return '<span class="glyph pos">●</span>';
  if (p.required) return '<span class="glyph neg">✕</span>';
  return '<span class="glyph warn">▲</span>';
}
function renderSmoke(s) {
  if (!s.ffdSmoke) return panel("panel-smoke", "FFD 数据面", "无", '<div class="empty">暂无冒烟测试，运行 npm run ffd:smoke。</div>');
  const f = s.ffdSmoke;
  const counts = Object.entries(f.statusCounts || {}).map(([k, v]) => k + "=" + v).join(" · ");
  const chips = (f.probes || []).map((p) =>
    '<div class="smoke-chip" title="' + esc(p.toolName) + (p.reason ? " · " + esc(p.reason) : "") + '">' + smokeGlyph(p) +
    '<span class="lbl">' + esc(p.id) + '</span><span class="st">' + esc(p.status) + "</span></div>"
  ).join("");
  return panel("panel-smoke", "FFD 数据面冒烟", (f.ok ? "正常" : "异常") + " · " + fmtAge(f.ageHours), '<div class="smoke-grid">' + chips + "</div>" + (counts ? '<div class="panel-label" style="margin-top:8px">' + esc(counts) + "</div>" : ""));
}

function renderTimeline(s) {
  const items = (s.history || []).slice().reverse();
  const newestIndex = items.length - 1;
  const grew = items.length > prevHistoryLen && prevHistoryLen >= 0;
  prevHistoryLen = items.length;
  const nodes = items.map((it, i) => {
    const cls = it.ok === true ? "pos" : it.ok === false ? "neg" : "mute";
    const node = '<div class="tl-node' + (grew && i === newestIndex ? " tl-new" : "") + '" title="' + esc(it.kind + " · " + fmtClock(it.at) + " · " + it.detail) + '">' +
      '<div class="tl-dot ' + cls + '"></div><div class="tl-kind">' + esc(it.kind) + '</div><div class="tl-age">' + esc((it.at || "").slice(5, 10)) + "</div></div>";
    return i < newestIndex ? node + '<div class="tl-conn"></div>' : node;
  }).join("") || '<div class="empty">暂无运行历史（runs/*.jsonl）。</div>';
  return panel("panel-timeline", "运行历史", "runs/*.jsonl", '<div class="timeline">' + nodes + "</div>");
}

function panel(cls, label, aux, body) {
  return '<section class="panel ' + cls + '"><div class="panel-head"><span class="panel-label">' + esc(label) + '</span>' +
    (aux ? '<span class="aux">' + esc(aux) + "</span>" : "") + "</div>" + body + "</section>";
}

function applyFlashes(root) {
  root.querySelectorAll("[data-fk]").forEach((el) => {
    const k = el.getAttribute("data-fk");
    const v = parseFloat(el.getAttribute("data-fv"));
    if (k in prevValues && prevValues[k] !== v && !isNaN(v)) {
      const cls = v > prevValues[k] ? "flash-pos" : "flash-neg";
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 470);
    }
    if (!isNaN(v)) prevValues[k] = v;
  });
}

function renderTopbar(s, ok) {
  const dot = $("pollDot");
  dot.className = "pulse-dot " + (ok ? "live" : "fail");
  if (ok) setTimeout(() => { dot.className = "pulse-dot" + (s && s.health.level !== "ok" ? " stale" : ""); }, 620);
  $("model").textContent = s ? s.model.provider + "/" + s.model.name : "—";
  const risk = $("risk");
  if (s && s.latestRun && s.latestRun.quant) { risk.style.display = ""; risk.textContent = s.latestRun.quant.riskMode; }
  else risk.style.display = "none";
  if (s) {
    const v = $("topVerdict");
    v.textContent = verdictWord(s.health.level);
    v.className = "verdict-word " + levelClass(s.health.level);
  }
  $("refreshed").textContent = ok ? "已刷新 · 每 10s 轮询" : "拉取失败 · 显示上次数据";
}

function renderFooter(s) {
  const parts = (s.freshness || []).map((f) => esc(f.source) + " " + fmtAge(f.ageHours) + (f.stale ? "(旧)" : ""));
  if (s.warnings && s.warnings.length) parts.push('<span class="warn">' + esc(s.warnings.length) + " 项读取告警</span>");
  parts.push("快照 " + fmtClock(s.generatedAt));
  $("footer").innerHTML = parts.join(" · ");
}

function render(s) {
  lastGood = s;
  const grid = $("grid");
  grid.innerHTML = renderHero(s) + renderDoctor(s) + renderWatchlist(s) + renderEvals(s) + renderCandidates(s) + renderCalibration(s) + renderSmoke(s) + renderTimeline(s);
  applyFlashes(grid);
  if (prevLevel !== null && prevLevel !== s.health.level && s.health.level !== "ok") {
    const v = $("verdict");
    if (v) { v.classList.add("nudge"); setTimeout(() => v.classList.remove("nudge"), 260); }
  }
  prevLevel = s.health.level;
  renderTopbar(s, true);
  renderFooter(s);
}

async function poll() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    render(await res.json());
  } catch (err) {
    renderTopbar(lastGood, false);
  }
}

poll();
setInterval(poll, POLL_MS);
`;
