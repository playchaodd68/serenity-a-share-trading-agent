import fs from "node:fs/promises";
import path from "node:path";
import type { CalibrationSnapshot, Candidate, ScreenRun } from "../types.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";

export const CALIBRATION_PATH = path.resolve("runs/calibration-latest.json");

function scoreBucket(score: number): string {
  if (score < 40) return "0-39";
  if (score < 55) return "40-54";
  if (score < 70) return "55-69";
  return "70+";
}

async function loadReportRuns(reportDir: string): Promise<ScreenRun[]> {
  try {
    const entries = await fs.readdir(reportDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.startsWith("screen-") && entry.name.endsWith(".json")).map((entry) => path.join(reportDir, entry.name));
    const runs = await Promise.all(files.map((file) => readJsonFile<ScreenRun | null>(file, null)));
    return runs.filter((run): run is ScreenRun => Boolean(run?.runId)).sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function countBy<T extends string>(values: T[], seed: Record<T, number>): Record<T, number> {
  const counts = { ...seed };
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function churn(runs: ScreenRun[]): CalibrationSnapshot["candidateChurn"] {
  const latest = runs.at(-1);
  const previous = runs.at(-2);
  if (!latest) return { entered: [], exited: [], retained: [] };
  if (!previous) return { latestRunId: latest.runId, entered: latest.candidates.map((candidate) => candidate.stock.code), exited: [], retained: [] };
  const latestCodes = new Set(latest.candidates.map((candidate) => candidate.stock.code));
  const previousCodes = new Set(previous.candidates.map((candidate) => candidate.stock.code));
  return {
    latestRunId: latest.runId,
    previousRunId: previous.runId,
    entered: [...latestCodes].filter((code) => !previousCodes.has(code)).sort(),
    exited: [...previousCodes].filter((code) => !latestCodes.has(code)).sort(),
    retained: [...latestCodes].filter((code) => previousCodes.has(code)).sort(),
  };
}

function coverageGapCounts(candidates: Candidate[]): Array<{ gap: string; count: number }> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    for (const gap of candidate.trace.coverageGaps) counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([gap, count]) => ({ gap, count }))
    .sort((a, b) => b.count - a.count || a.gap.localeCompare(b.gap))
    .slice(0, 12);
}

export async function buildCalibrationSnapshot(reportDir = "reports", now = new Date().toISOString()): Promise<CalibrationSnapshot> {
  const runs = await loadReportRuns(reportDir);
  const candidates = runs.flatMap((run) => run.candidates);
  return {
    generatedAt: now,
    reportsAnalyzed: runs.length,
    candidatesAnalyzed: candidates.length,
    scoreDistribution: countBy(
      candidates.map((candidate) => scoreBucket(candidate.score)),
      { "0-39": 0, "40-54": 0, "55-69": 0, "70+": 0 },
    ),
    confidenceDistribution: countBy(
      candidates.map((candidate) => candidate.confidence),
      { low: 0, medium: 0, high: 0 },
    ),
    recurringCoverageGaps: coverageGapCounts(candidates),
    latestCoverageGaps: coverageGapCounts(runs.at(-1)?.candidates ?? []),
    candidateChurn: churn(runs),
  };
}

export async function writeCalibrationSnapshot(snapshot: CalibrationSnapshot, filePath = CALIBRATION_PATH): Promise<void> {
  await writeJsonFile(filePath, snapshot);
}

export function renderCalibrationSnapshot(snapshot: CalibrationSnapshot): string {
  return [
    `Calibration snapshot: reports=${snapshot.reportsAnalyzed}, candidates=${snapshot.candidatesAnalyzed}`,
    `Scores: ${Object.entries(snapshot.scoreDistribution)
      .map(([bucket, count]) => `${bucket}=${count}`)
      .join(", ")}`,
    `Confidence: ${Object.entries(snapshot.confidenceDistribution)
      .map(([bucket, count]) => `${bucket}=${count}`)
      .join(", ")}`,
    `Churn: entered=${snapshot.candidateChurn.entered.length}, exited=${snapshot.candidateChurn.exited.length}, retained=${snapshot.candidateChurn.retained.length}`,
    ...(snapshot.latestCoverageGaps.length > 0 ? snapshot.latestCoverageGaps.slice(0, 5).map((gap) => `Latest gap ${gap.count}x: ${gap.gap}`) : ["Latest gaps: none"]),
    ...snapshot.recurringCoverageGaps.slice(0, 5).map((gap) => `Historical gap ${gap.count}x: ${gap.gap}`),
  ].join("\n");
}
