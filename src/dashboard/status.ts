import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, type AppConfig } from "../config.js";
import { diagnoseRuntime, type DoctorCheck, type DoctorReport } from "../operations.js";
import { findLatestRun } from "../report.js";
import { CALIBRATION_PATH } from "../research/calibration.js";
import { loadWatchlist, WATCHLIST_PATH } from "../research/watchlist.js";
import { readJsonFile } from "../utils/fs.js";
import type {
  AnswerSafetyEvalResult,
  CalibrationSnapshot,
  ScreenRun,
  WatchlistEntry,
  WatchlistStatus,
} from "../types.js";
import type { FfdSmokeRun } from "../research/ffd-smoke.js";

export const EVALS_PATH = path.resolve("runs/answer-safety-evals-latest.json");
export const FFD_SMOKE_PATH = path.resolve("runs/ffd-smoke-latest.json");

const RUN_STALE_HOURS = 36;
const WATCHLIST_STALE_HOURS = 36;
const SMOKE_STALE_HOURS = 24;
const HISTORY_LIMIT = 24;
const TOP_CANDIDATES = 8;
const UPCOMING_REVIEWS = 6;

const WATCHLIST_STATUSES: WatchlistStatus[] = ["validated", "investigating", "evidence-needed", "downgraded", "archived"];

export type HealthLevel = "ok" | "warn" | "error";

export interface HealthRollup {
  level: HealthLevel;
  headline: string;
  reasons: string[];
}

export interface FreshnessInfo {
  source: string;
  at?: string;
  ageHours: number | null;
  stale: boolean;
}

export interface DashboardCandidate {
  rank: number;
  code: string;
  name: string;
  score: number;
  confidence: "low" | "medium" | "high";
  industry: string;
  quantBucket?: string;
  quantScore?: number;
}

export interface DashboardLatestRun {
  runId: string;
  generatedAt: string;
  ageHours: number | null;
  stale: boolean;
  totalStocksScanned: number;
  sourceCount: number;
  candidateCount: number;
  quant?: {
    riskMode: string;
    bucketCounts: Record<string, number>;
    topIndustries: Array<{ industryKey: string; score: number; tier: string; candidateCount: number }>;
  };
  topCandidates: DashboardCandidate[];
}

export interface DashboardWatchlist {
  total: number;
  statusCounts: Record<WatchlistStatus, number>;
  withCandidateP0: number;
  ageHours: number | null;
  stale: boolean;
  upcomingReviews: Array<{ code: string; name: string; status: WatchlistStatus; nextReviewAt: string; overdue: boolean }>;
}

export interface DashboardCalibration {
  generatedAt: string;
  reportsAnalyzed: number;
  candidatesAnalyzed: number;
  scoreDistribution: Record<string, number>;
  confidenceDistribution: Record<string, number>;
  churn: { entered: number; exited: number; retained: number };
  recurringCoverageGaps: Array<{ gap: string; count: number }>;
}

export interface DashboardEvals {
  passed: number;
  total: number;
  failing: Array<{ id: string; detail: string }>;
}

export interface DashboardFfdSmoke {
  generatedAt: string;
  ok: boolean;
  ageHours: number | null;
  stale: boolean;
  statusCounts: Record<string, number>;
  probes: Array<{ id: string; label: string; toolName: string; status: string; ok: boolean; required: boolean; reason?: string }>;
}

export interface RunHistoryItem {
  kind: string;
  at: string;
  ok: boolean | null;
  detail: string;
}

export interface AgentStatusSnapshot {
  generatedAt: string;
  health: HealthRollup;
  model: { provider: string; name: string };
  doctor: {
    ok: boolean;
    generatedAt: string;
    counts: { ok: number; total: number; info: number; warning: number; error: number };
    failing: DoctorCheck[];
    checks: DoctorCheck[];
  };
  latestRun?: DashboardLatestRun;
  watchlist: DashboardWatchlist;
  calibration?: DashboardCalibration;
  evals?: DashboardEvals;
  ffdSmoke?: DashboardFfdSmoke;
  freshness: FreshnessInfo[];
  history: RunHistoryItem[];
  warnings: string[];
}

function ageHours(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return null;
  return (now - value) / 3_600_000;
}

function isStale(hours: number | null, threshold: number): boolean {
  return hours == null || hours > threshold;
}

function latestWatchlistTimestamp(entries: WatchlistEntry[]): string | undefined {
  return entries
    .flatMap((entry) => [entry.lastSeenAt, ...entry.events.map((event) => event.at)])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

export function summarizeDoctor(report: DoctorReport): AgentStatusSnapshot["doctor"] {
  const counts = report.checks.reduce(
    (acc, check) => {
      acc.total += 1;
      if (check.ok) acc.ok += 1;
      acc[check.severity] += 1;
      return acc;
    },
    { ok: 0, total: 0, info: 0, warning: 0, error: 0 },
  );
  return {
    ok: report.ok,
    generatedAt: report.generatedAt,
    counts,
    failing: report.checks.filter((check) => !check.ok),
    checks: report.checks,
  };
}

export function summarizeLatestRun(run: ScreenRun | null, now: number): DashboardLatestRun | undefined {
  if (!run) return undefined;
  const age = ageHours(run.generatedAt, now);
  return {
    runId: run.runId,
    generatedAt: run.generatedAt,
    ageHours: age,
    stale: isStale(age, RUN_STALE_HOURS),
    totalStocksScanned: run.totalStocksScanned,
    sourceCount: run.sourceCount,
    candidateCount: run.candidates.length,
    quant: run.quantSummary
      ? {
          riskMode: run.quantSummary.riskMode,
          bucketCounts: run.quantSummary.bucketCounts,
          topIndustries: run.quantSummary.industryTiers.slice(0, 6),
        }
      : undefined,
    topCandidates: run.candidates.slice(0, TOP_CANDIDATES).map((candidate, index) => ({
      rank: index + 1,
      code: candidate.stock.code,
      name: candidate.stock.name,
      score: candidate.score,
      confidence: candidate.confidence,
      industry: candidate.stock.industry || "n/a",
      quantBucket: candidate.quant?.bucket,
      quantScore: candidate.quant?.stockScore,
    })),
  };
}

export function summarizeWatchlist(entries: WatchlistEntry[], now: number): DashboardWatchlist {
  const statusCounts = WATCHLIST_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<WatchlistStatus, number>,
  );
  for (const entry of entries) statusCounts[entry.status] = (statusCounts[entry.status] ?? 0) + 1;
  const updatedAt = latestWatchlistTimestamp(entries);
  const age = ageHours(updatedAt, now);
  const upcomingReviews = entries
    .filter((entry) => entry.status !== "archived")
    .slice()
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, UPCOMING_REVIEWS)
    .map((entry) => ({
      code: entry.code,
      name: entry.name,
      status: entry.status,
      nextReviewAt: entry.nextReviewAt,
      overdue: new Date(entry.nextReviewAt).getTime() < now,
    }));
  return {
    total: entries.length,
    statusCounts,
    withCandidateP0: entries.filter((entry) => entry.evidenceState.hasCandidateP0).length,
    ageHours: age,
    stale: entries.length === 0 || isStale(age, WATCHLIST_STALE_HOURS),
    upcomingReviews,
  };
}

function summarizeCalibration(snapshot: CalibrationSnapshot | null): DashboardCalibration | undefined {
  if (!snapshot) return undefined;
  return {
    generatedAt: snapshot.generatedAt,
    reportsAnalyzed: snapshot.reportsAnalyzed,
    candidatesAnalyzed: snapshot.candidatesAnalyzed,
    scoreDistribution: snapshot.scoreDistribution,
    confidenceDistribution: snapshot.confidenceDistribution,
    churn: {
      entered: snapshot.candidateChurn.entered.length,
      exited: snapshot.candidateChurn.exited.length,
      retained: snapshot.candidateChurn.retained.length,
    },
    recurringCoverageGaps: snapshot.recurringCoverageGaps.slice(0, 6),
  };
}

export function summarizeEvals(results: AnswerSafetyEvalResult[]): DashboardEvals | undefined {
  if (results.length === 0) return undefined;
  return {
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    failing: results.filter((result) => !result.passed).map((result) => ({ id: result.id, detail: result.detail })),
  };
}

export function summarizeFfdSmoke(run: FfdSmokeRun | null, now: number): DashboardFfdSmoke | undefined {
  if (!run) return undefined;
  const age = ageHours(run.generatedAt, now);
  const statusCounts = run.results.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: run.generatedAt,
    ok: run.ok,
    ageHours: age,
    stale: isStale(age, SMOKE_STALE_HOURS),
    statusCounts,
    probes: run.results.map((item) => ({
      id: item.id,
      label: item.label,
      toolName: item.toolName,
      status: item.status,
      ok: item.ok,
      required: item.required,
      reason: item.reason,
    })),
  };
}

async function readRecentHistory(): Promise<{ items: RunHistoryItem[]; warnings: string[] }> {
  const files: Array<{ file: string; kind: string; describe: (entry: Record<string, unknown>) => string }> = [
    { file: "runs/screen.jsonl", kind: "screen", describe: (e) => `runId ${e.runId ?? "?"}, candidates ${e.candidates ?? "?"}` },
    { file: "runs/research-refresh.jsonl", kind: "research-refresh", describe: (e) => `runId ${e.runId ?? "?"}, evals ${e.evalsPassed ?? "?"}/${e.evalsTotal ?? "?"}` },
    { file: "runs/doctor.jsonl", kind: "doctor", describe: (e) => `doctor ${e.ok ? "ok" : "needs attention"}` },
    { file: "runs/ffd-smoke.jsonl", kind: "ffd-smoke", describe: (e) => `data-plane ${e.ok ? "ok" : "needs attention"}` },
    { file: "runs/ffd-signal.jsonl", kind: "ffd-signal", describe: (e) => `${e.mode ?? "?"} ${e.status ?? ""}`.trim() },
    { file: "runs/ffd-report-library.jsonl", kind: "reports", describe: (e) => `${e.type ?? "?"} ${e.processed ?? e.reportId ?? ""}`.trim() },
    { file: "runs/quant-backtest.jsonl", kind: "quant-backtest", describe: (e) => `periods ${e.periods ?? "?"}, return ${typeof e.totalReturn === "number" ? (e.totalReturn * 100).toFixed(1) + "%" : "?"}` },
    { file: "runs/ingest.jsonl", kind: "ingest", describe: (e) => `sources ${e.sources ?? "?"}` },
  ];
  const warnings: string[] = [];
  const items: RunHistoryItem[] = [];
  for (const { file, kind, describe } of files) {
    let raw: string;
    try {
      raw = await fs.readFile(path.resolve(file), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") warnings.push(`Failed to read ${file}: ${(error as Error).message}`);
      continue;
    }
    const lines = raw.split("\n").filter((line) => line.trim()).slice(-6);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const at = typeof entry.at === "string" ? entry.at : undefined;
        if (!at) continue;
        items.push({
          kind,
          at,
          ok: typeof entry.ok === "boolean" ? entry.ok : typeof entry.doctorOk === "boolean" ? (entry.doctorOk as boolean) : null,
          detail: describe(entry),
        });
      } catch {
        warnings.push(`Skipped malformed line in ${file}.`);
      }
    }
  }
  items.sort((a, b) => b.at.localeCompare(a.at));
  return { items: items.slice(0, HISTORY_LIMIT), warnings };
}

export function buildHealthRollup(snapshot: Omit<AgentStatusSnapshot, "health">): HealthRollup {
  const reasons: string[] = [];
  let level: HealthLevel = "ok";
  const escalate = (next: HealthLevel) => {
    if (next === "error" || (next === "warn" && level === "ok")) level = next;
  };

  const failingErrors = snapshot.doctor.failing.filter((check) => check.severity === "error");
  if (failingErrors.length > 0) {
    escalate("error");
    reasons.push(`运行体检存在 ${failingErrors.length} 项严重失败：${failingErrors.map((check) => check.name).join("、")}`);
  }
  if (snapshot.evals && snapshot.evals.passed < snapshot.evals.total) {
    escalate("error");
    reasons.push(`回答安全评测未全部通过（${snapshot.evals.passed}/${snapshot.evals.total}）`);
  }

  const failingWarnings = snapshot.doctor.failing.filter((check) => check.severity === "warning");
  if (failingWarnings.length > 0) {
    escalate("warn");
    reasons.push(`运行体检有 ${failingWarnings.length} 项警告：${failingWarnings.map((check) => check.name).join("、")}`);
  }
  if (!snapshot.latestRun) {
    escalate("warn");
    reasons.push("尚未找到任何筛选报告（reports/screen-*.json）");
  } else if (snapshot.latestRun.stale) {
    escalate("warn");
    reasons.push(`最新筛选报告已过期（${snapshot.latestRun.ageHours == null ? "时间未知" : snapshot.latestRun.ageHours.toFixed(1) + "h"}）`);
  }
  if (snapshot.watchlist.stale) {
    escalate("warn");
    reasons.push(snapshot.watchlist.total === 0 ? "观察清单为空" : "观察清单数据已过期");
  }
  if (snapshot.ffdSmoke && !snapshot.ffdSmoke.ok) {
    escalate("warn");
    reasons.push("FFD 数据面冒烟测试未通过");
  }

  const headline = level === "ok" ? "系统运行正常" : level === "warn" ? "需要关注" : "存在严重问题";
  if (reasons.length === 0) reasons.push("所有关键检查项均通过");
  return { level, headline, reasons };
}

export async function collectAgentStatus(config: AppConfig = getConfig(), now = Date.now()): Promise<AgentStatusSnapshot> {
  const warnings: string[] = [];
  const safe = async <T>(label: string, task: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await task;
    } catch (error) {
      warnings.push(`${label} 读取失败：${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  };

  const [doctorReport, latestRun, watchlist, calibration, evals, ffdSmoke, history] = await Promise.all([
    safe<DoctorReport>("运行体检", diagnoseRuntime(config), {
      ok: false,
      generatedAt: new Date(now).toISOString(),
      checks: [],
    }),
    safe<ScreenRun | null>("最新筛选报告", findLatestRun(), null),
    safe<WatchlistEntry[]>("观察清单", loadWatchlist(), []),
    safe<CalibrationSnapshot | null>("校准快照", readJsonFile<CalibrationSnapshot | null>(CALIBRATION_PATH, null), null),
    safe<AnswerSafetyEvalResult[]>("安全评测", readJsonFile<AnswerSafetyEvalResult[]>(EVALS_PATH, []), []),
    safe<FfdSmokeRun | null>("FFD 冒烟测试", readJsonFile<FfdSmokeRun | null>(FFD_SMOKE_PATH, null), null),
    safe("运行历史", readRecentHistory(), { items: [] as RunHistoryItem[], warnings: [] as string[] }),
  ]);
  warnings.push(...history.warnings);

  const doctor = summarizeDoctor(doctorReport);
  const latest = summarizeLatestRun(latestRun, now);
  const watchlistSummary = summarizeWatchlist(watchlist, now);
  const calibrationSummary = summarizeCalibration(calibration);
  const evalsSummary = summarizeEvals(evals);
  const ffdSmokeSummary = summarizeFfdSmoke(ffdSmoke, now);

  const freshness: FreshnessInfo[] = [
    { source: "运行体检", at: doctor.generatedAt, ageHours: ageHours(doctor.generatedAt, now), stale: false },
    { source: "筛选报告", at: latest?.generatedAt, ageHours: latest?.ageHours ?? null, stale: latest ? latest.stale : true },
    { source: "观察清单", at: latestWatchlistTimestamp(watchlist), ageHours: watchlistSummary.ageHours, stale: watchlistSummary.stale },
    { source: "FFD 数据面", at: ffdSmokeSummary?.generatedAt, ageHours: ffdSmokeSummary?.ageHours ?? null, stale: ffdSmokeSummary ? ffdSmokeSummary.stale : true },
    { source: "校准快照", at: calibrationSummary?.generatedAt, ageHours: ageHours(calibrationSummary?.generatedAt, now), stale: !calibrationSummary },
  ];

  const partial: Omit<AgentStatusSnapshot, "health"> = {
    generatedAt: new Date(now).toISOString(),
    model: { provider: config.modelProvider, name: config.modelName },
    doctor,
    latestRun: latest,
    watchlist: watchlistSummary,
    calibration: calibrationSummary,
    evals: evalsSummary,
    ffdSmoke: ffdSmokeSummary,
    freshness,
    history: history.items,
    warnings,
  };

  return { ...partial, health: buildHealthRollup(partial) };
}
