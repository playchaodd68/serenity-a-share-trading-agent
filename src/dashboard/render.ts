import type { AppConfig } from "../config.js";
import { DASHBOARD_CSS } from "./styles.js";
import { DASHBOARD_CLIENT_JS } from "./client.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDashboardShell(config: AppConfig): string {
  const model = escapeHtml(`${config.modelProvider}/${config.modelName}`);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>Serenity · A股交易研究终端</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  <div class="topbar">
    <span class="pulse-dot" id="pollDot"></span>
    <span class="brand"><b>SERENITY</b> · A股交易研究终端</span>
    <span class="pill mute" id="model">${model}</span>
    <span class="pill info" id="risk" style="display:none"></span>
    <span class="spacer"></span>
    <span class="meta">健康</span>
    <span class="verdict-word" id="topVerdict">…</span>
    <span class="meta" id="refreshed">连接中…</span>
  </div>
  <main class="grid" id="grid"></main>
  <footer class="footer" id="footer"></footer>
  <script>${DASHBOARD_CLIENT_JS}</script>
</body>
</html>`;
}
