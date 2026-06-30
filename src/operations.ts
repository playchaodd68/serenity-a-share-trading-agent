import fs from "node:fs/promises";
import path from "node:path";
import { findEnvKeys, getModel } from "@earendil-works/pi-ai";
import { callFfdTool, checkFfdHealth, classifyFfdToolText, renderFfdToolResultWithStatus, sanitizeFfdText } from "./connectors/ffd.js";
import { anthropicOAuthStatus } from "./auth/anthropic-oauth.js";
import { getConfig, knowledgebasePath, type AppConfig } from "./config.js";
import { findLatestRun } from "./report.js";
import { mergeSources } from "./sources/registry.js";
import { SEED_SOURCES } from "./sources/seed.js";
import { readJsonFile } from "./utils/fs.js";
import type { SourceRecord, SourceTier } from "./types.js";
import { loadWatchlist, WATCHLIST_PATH } from "./research/watchlist.js";
import { listFfdReportManifests, qualityForManifest } from "./research/report-library.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  severity: "info" | "warning" | "error";
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  generatedAt: string;
  checks: DoctorCheck[];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function check(name: string, ok: boolean, severity: DoctorCheck["severity"], detail: string): DoctorCheck {
  return { name, ok, severity, detail };
}

function ageHours(iso?: string): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return null;
  return (Date.now() - value) / 3_600_000;
}

function latestWatchlistAt(entries: Awaited<ReturnType<typeof loadWatchlist>>): string | undefined {
  return entries
    .flatMap((entry) => [entry.lastSeenAt, ...entry.events.map((item) => item.at)])
    .filter(Boolean)
    .sort()
    .at(-1);
}

export async function diagnoseRuntime(config: AppConfig = getConfig()): Promise<DoctorReport> {
  const kbRoot = knowledgebasePath(config);
  const sourceRegistryPath = path.resolve("data/source-registry.json");
  const persistedSources = await readJsonFile<SourceRecord[]>(sourceRegistryPath, []);
  const sources = mergeSources(persistedSources, SEED_SOURCES);
  const configuredModel = getModel(config.modelProvider as any, config.modelName as any);
  const modelEnvKeys = findEnvKeys(config.modelProvider as any);
  // A Claude subscription login (OAuth credential file) also satisfies model auth,
  // even though it is not an environment API key.
  const anthropicLoggedIn = config.modelProvider === "anthropic" ? (await anthropicOAuthStatus(config.anthropicOAuthCredentialsPath)).loggedIn : false;
  const hasModelAuth = Boolean(modelEnvKeys?.length) || anthropicLoggedIn;
  const modelAuthDetail = anthropicLoggedIn
    ? "Claude subscription OAuth login"
    : modelEnvKeys?.length
      ? modelEnvKeys.join(", ")
      : config.modelProvider === "anthropic"
        ? "not logged in (run npm run auth:anthropic) and no ANTHROPIC_OAUTH_TOKEN/ANTHROPIC_API_KEY"
        : `no API key found for provider ${config.modelProvider}`;
  const tierCounts = sources.reduce<Record<SourceTier, number>>(
    (counts, source) => {
      counts[source.tier] += 1;
      return counts;
    },
    { P0: 0, P1: 0, P2: 0 },
  );
  const latestRun = await findLatestRun();
  const latestRunAgeHours = ageHours(latestRun?.generatedAt);
  const watchlist = await loadWatchlist();
  const watchlistUpdatedAt = latestWatchlistAt(watchlist);
  const watchlistAgeHours = ageHours(watchlistUpdatedAt);
  const ffdReports = await listFfdReportManifests();
  const ffdReportCounts = ffdReports.reduce(
    (counts, report) => {
      counts[report.status] = (counts[report.status] ?? 0) + 1;
      if (qualityForManifest(report).canAccept) counts.qualityPass += 1;
      if (report.status === "staged" && qualityForManifest(report).canAccept) counts.stagedQualityPass += 1;
      return counts;
    },
    { accepted: 0, staged: 0, rejected: 0, downloaded: 0, archived: 0, qualityPass: 0, stagedQualityPass: 0 } as Record<string, number>,
  );
  const acceptedFfdSourceCount = sources.filter((source) => source.provider === "FFD" && source.reviewStatus === "accepted").length;
  const hasFeishuNotifyChannel = Boolean(
    config.feishuWebhookUrl || (config.feishuAppId && config.feishuAppSecret && (config.feishuNotifyOpenId || config.feishuNotifyChatId)),
  );
  let ffdOk = false;
  let ffdDetail = "not checked";
  let ffdDataPlaneOk = false;
  let ffdDataPlaneDetail = "not checked";
  try {
    const health = await checkFfdHealth({ timeoutMs: 5_000 });
    ffdOk = health.status === "ok";
    ffdDetail = `status=${health.status ?? "unknown"}, version=${health.mcp_server_version ?? "unknown"}, auto_update=${health.auto_update ?? "unknown"}`;
  } catch (error) {
    ffdDetail = sanitizeFfdText(error instanceof Error ? error.message : String(error));
  }
  try {
    const dataPlane = await callFfdTool("ffd_industry_signal", { query: "半导体", market: "stock", format: "markdown" }, { timeoutMs: 8_000 });
    const text = renderFfdToolResultWithStatus(dataPlane);
    const classification = classifyFfdToolText(text);
    ffdDataPlaneOk = classification.status === "ok" || classification.status === "empty_data" || classification.status === "unknown_warning";
    ffdDataPlaneDetail = classification.status === "ok"
      ? "industry-signal smoke query returned without data-plane warning"
      : `industry-signal smoke query status=${classification.status}${classification.reason ? ` (${classification.reason})` : ""}; run npm run ffd:smoke for full data-plane coverage`;
  } catch (error) {
    ffdDataPlaneDetail = sanitizeFfdText(error instanceof Error ? error.message : String(error));
  }

  const checks: DoctorCheck[] = [
    check("obsidian-kb", await pathExists(kbRoot), "info", `${kbRoot} (manual archive only: npm run obsidian:init or /archive-obsidian)`),
    check("source-registry", sources.length > 0, "error", `${sourceRegistryPath} persisted=${persistedSources.length}, effective=${sources.length}`),
    check("primary-source-coverage", tierCounts.P0 > 0, "warning", `P0=${tierCounts.P0}, P1=${tierCounts.P1}, P2=${tierCounts.P2}`),
    check("report-inbox", await pathExists(config.reportInbox), "warning", config.reportInbox),
    check("ffd-report-raw-dir", await pathExists(config.ffdReportRawDir), "info", config.ffdReportRawDir),
    check("ffd-report-processed-dir", await pathExists(config.ffdReportProcessedDir), "info", config.ffdReportProcessedDir),
    check(
      "ffd-accepted-rag-sources",
      acceptedFfdSourceCount >= ffdReportCounts.accepted,
      "warning",
      `source-registry=${acceptedFfdSourceCount}, manifests accepted=${ffdReportCounts.accepted}, staged=${ffdReportCounts.staged}, staged-pass=${ffdReportCounts.stagedQualityPass}, quality-pass-total=${ffdReportCounts.qualityPass}`,
    ),
    check("latest-screen-report", latestRun != null, "warning", latestRun?.reportPath ?? "no screen report JSON found under reports/"),
    check(
      "research-run-recency",
      latestRunAgeHours != null && latestRunAgeHours <= 36,
      "warning",
      latestRunAgeHours == null ? "no dated screen run found" : `${latestRun?.runId ?? "unknown-run"} age=${latestRunAgeHours.toFixed(1)}h`,
    ),
    check(
      "watchlist-state",
      watchlist.length > 0 && watchlistAgeHours != null && watchlistAgeHours <= 36,
      "warning",
      watchlist.length === 0 ? `${WATCHLIST_PATH} empty or missing` : `${WATCHLIST_PATH} entries=${watchlist.length}, age=${watchlistAgeHours?.toFixed(1) ?? "unknown"}h`,
    ),
    check(
      "feishu-notification-channel",
      hasFeishuNotifyChannel,
      "warning",
      config.feishuWebhookUrl
        ? "incoming webhook configured"
        : config.feishuNotifyChatId
          ? "bot chat notification configured"
          : config.feishuNotifyOpenId
            ? "bot private open_id notification configured"
            : "production gap: configure FEISHU_WEBHOOK_URL, FEISHU_NOTIFY_OPEN_ID, or FEISHU_NOTIFY_CHAT_ID",
    ),
    check("ffd-mcp", ffdOk, "warning", ffdDetail),
    check("ffd-data-plane", ffdDataPlaneOk, "warning", ffdDataPlaneDetail),
    check("ffd-feishu-webhook", Boolean(config.ffdFeishuWebhookUrl), "info", config.ffdFeishuWebhookUrl ? "custom bot webhook configured" : "not configured"),
    check("ffd-report-relay", Boolean(config.ffdReportRelayToken), "info", config.ffdReportRelayToken ? "tokenized relay enabled" : "not configured"),
    check("feishu-callback-token", Boolean(config.feishuVerificationToken), "info", config.feishuVerificationToken ? "configured" : "not configured"),
    check("feishu-app-credentials", Boolean(config.feishuAppId && config.feishuAppSecret), "info", config.feishuAppId && config.feishuAppSecret ? "configured" : "not configured"),
    check(
      "feishu-report-notification",
      Boolean(config.feishuReportAppId && config.feishuReportAppSecret && (config.feishuReportNotifyReceiveId || config.feishuReportNotifyOpenId)),
      "info",
      config.feishuReportNotifyReceiveId || config.feishuReportNotifyOpenId
        ? config.feishuReportAppId === config.feishuAppId
          ? `private ${config.feishuReportNotifyReceiveId ? config.feishuReportNotifyReceiveIdType : "open_id"} configured with default app credentials`
          : `private ${config.feishuReportNotifyReceiveId ? config.feishuReportNotifyReceiveIdType : "open_id"} configured with report app credentials`
        : "not configured",
    ),
    check("model-config", Boolean(configuredModel), "error", `${config.modelProvider}/${config.modelName}`),
    check("model-api-key", hasModelAuth, "warning", modelAuthDetail),
  ];

  return {
    ok: checks.every((item) => item.ok || item.severity !== "error"),
    generatedAt: new Date().toISOString(),
    checks,
  };
}

export function renderDoctorReport(report: DoctorReport): string {
  return [
    `Runtime doctor: ${report.ok ? "ok" : "needs attention"}`,
    `Generated: ${report.generatedAt}`,
    "",
    ...report.checks.map((item) => `${item.ok ? "✓" : "!"} [${item.severity}] ${item.name}: ${item.detail}`),
  ].join("\n");
}

export function renderCronExample(): string {
  const cwd = process.cwd();
  return `# Daily run example. Edit the time/path before installing.
0 8 * * 1-5 cd ${cwd.replaceAll(" ", "\\ ")} && npm run daily-run >> runs/cron.log 2>&1
`;
}
