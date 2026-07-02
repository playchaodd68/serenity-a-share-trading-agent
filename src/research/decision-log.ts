import path from "node:path";
import type { CandidateResolution, ConfidenceLevel, ScreenRun } from "../types.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";

// Append-only decision log (N1): every screened conclusion is registered as a pending
// entry the moment it ships, then resolved against realized alpha with a short plain-
// prose reflection (ported pattern: TradingAgents TradingMemoryLog pending->resolved +
// reflection write-back). This is the data floor under the Brier loop and the
// sycophancy slices — a decision that was never logged can never be audited.

export const DECISION_LOG_PATH = path.resolve("data/decision-log.json");

export interface DecisionLogEntry {
  id: string;
  code: string;
  name: string;
  runId: string;
  decidedAt: string;
  score: number;
  confidence: ConfidenceLevel;
  probability: number;
  status: "pending" | "resolved";
  resolvedAt?: string;
  realizedAlpha?: number;
  outcomeLabel?: CandidateResolution["outcomeLabel"];
  brier?: number;
  reflection?: string;
}

function clampProbability(score: number): number {
  return Math.min(0.95, Math.max(0.05, score / 100));
}

export async function loadDecisionLog(filePath = DECISION_LOG_PATH): Promise<DecisionLogEntry[]> {
  return readJsonFile<DecisionLogEntry[]>(filePath, []);
}

export async function saveDecisionLog(entries: DecisionLogEntry[], filePath = DECISION_LOG_PATH): Promise<void> {
  await writeJsonFile(filePath, entries);
}

export function pendingEntriesFromRun(run: ScreenRun, existing: DecisionLogEntry[]): DecisionLogEntry[] {
  const seen = new Set(existing.map((entry) => entry.id));
  const additions: DecisionLogEntry[] = [];
  for (const candidate of run.candidates) {
    const id = `${run.runId}:${candidate.stock.code}`;
    if (seen.has(id)) continue;
    additions.push({
      id,
      code: candidate.stock.code,
      name: candidate.stock.name,
      runId: run.runId,
      decidedAt: run.generatedAt,
      score: candidate.score,
      confidence: candidate.confidence,
      probability: clampProbability(candidate.score),
      status: "pending",
    });
  }
  return additions;
}

export function buildReflection(entry: DecisionLogEntry, resolution: CandidateResolution): string {
  const direction = resolution.outcomeLabel === "validated" ? "验证" : resolution.outcomeLabel === "falsified" ? "证伪" : "无定论";
  const alphaText = `${(resolution.realizedAlpha * 100).toFixed(1)}%`;
  const calibrationText =
    resolution.brier <= 0.1
      ? "该判断校准良好。"
      : entry.probability >= 0.6 && resolution.outcome === 0
        ? "高置信但落空：复查当时的证据缺口与反方论点是否被充分权衡。"
        : entry.probability < 0.5 && resolution.outcome === 1
          ? "低置信但兑现：检查是否存在系统性过度保守或证据延迟入库。"
          : "校准处于中间带，继续积累样本。";
  return `${entry.code} 在 ${resolution.horizonDays} 天窗口被${direction}，相对基准 alpha ${alphaText}。当时评分 ${entry.score.toFixed(1)}（隐含概率 ${(entry.probability * 100).toFixed(0)}%）。${calibrationText}`;
}

export function resolveDecisionEntries(entries: DecisionLogEntry[], resolutions: CandidateResolution[]): { entries: DecisionLogEntry[]; resolvedCount: number } {
  const byCode = new Map(resolutions.map((resolution) => [resolution.code, resolution]));
  let resolvedCount = 0;
  const next = entries.map((entry) => {
    if (entry.status === "resolved") return entry;
    const resolution = byCode.get(entry.code);
    // A resolution whose observation window opened before the decision was made cannot
    // grade that decision — only same-day-or-later windows count.
    if (!resolution || resolution.entryDate.slice(0, 10) < entry.decidedAt.slice(0, 10)) return entry;
    resolvedCount += 1;
    return {
      ...entry,
      status: "resolved" as const,
      resolvedAt: resolution.resolvedAt,
      realizedAlpha: resolution.realizedAlpha,
      outcomeLabel: resolution.outcomeLabel,
      brier: resolution.brier,
      reflection: buildReflection(entry, resolution),
    };
  });
  return { entries: next, resolvedCount };
}

export function summarizeDecisionLog(entries: DecisionLogEntry[]): { total: number; pending: number; resolved: number; validatedRate: number | null } {
  const resolved = entries.filter((entry) => entry.status === "resolved");
  const withOutcome = resolved.filter((entry) => entry.outcomeLabel === "validated" || entry.outcomeLabel === "falsified");
  return {
    total: entries.length,
    pending: entries.length - resolved.length,
    resolved: resolved.length,
    validatedRate:
      withOutcome.length > 0 ? Number((withOutcome.filter((entry) => entry.outcomeLabel === "validated").length / withOutcome.length).toFixed(4)) : null,
  };
}
