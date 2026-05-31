import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, knowledgebasePath, type AppConfig } from "./config.js";
import { findLatestRun } from "./report.js";
import { readJsonFile } from "./utils/fs.js";
import type { SourceRecord, SourceTier } from "./types.js";

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

export async function diagnoseRuntime(config: AppConfig = getConfig()): Promise<DoctorReport> {
  const kbRoot = knowledgebasePath(config);
  const sourceRegistryPath = path.resolve("data/source-registry.json");
  const sources = await readJsonFile<SourceRecord[]>(sourceRegistryPath, []);
  const tierCounts = sources.reduce<Record<SourceTier, number>>(
    (counts, source) => {
      counts[source.tier] += 1;
      return counts;
    },
    { P0: 0, P1: 0, P2: 0 },
  );
  const latestRun = await findLatestRun();

  const checks: DoctorCheck[] = [
    check("obsidian-kb", await pathExists(kbRoot), "error", kbRoot),
    check("source-registry", sources.length > 0, "error", `${sourceRegistryPath} sources=${sources.length}`),
    check("primary-source-coverage", tierCounts.P0 > 0, "warning", `P0=${tierCounts.P0}, P1=${tierCounts.P1}, P2=${tierCounts.P2}`),
    check("report-inbox", await pathExists(config.reportInbox), "warning", config.reportInbox),
    check("latest-screen-report", latestRun != null, "warning", latestRun?.reportPath ?? "no screen report JSON found under reports/"),
    check("feishu-webhook", Boolean(config.feishuWebhookUrl), "info", config.feishuWebhookUrl ? "configured" : "not configured"),
    check("feishu-callback-token", Boolean(config.feishuVerificationToken), "info", config.feishuVerificationToken ? "configured" : "not configured"),
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
