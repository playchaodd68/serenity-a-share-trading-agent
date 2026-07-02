import path from "node:path";
import type { Candidate, ScreenRun, WatchlistEntry, WatchlistEvent, WatchlistStatus } from "../types.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";
import { evidenceHasCandidateP0 } from "./evidence.js";

export const WATCHLIST_PATH = path.resolve("data/watchlist.json");

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function evidenceState(candidate: Candidate): WatchlistEntry["evidenceState"] {
  const evidence = candidate.trace.structuredEvidence ?? [];
  return {
    hasCandidateP0: evidenceHasCandidateP0(evidence),
    directEvidenceCount: evidence.filter((item) => item.direct).length,
    corroboratingEvidenceCount: evidence.filter((item) => !item.direct && item.polarity !== "negative").length,
    riskEvidenceCount: evidence.filter((item) => item.polarity === "negative" || item.kind === "risk").length,
  };
}

export function classifyWatchlistStatus(candidate: Candidate): WatchlistStatus {
  const state = evidenceState(candidate);
  if (candidate.score < 35) return "downgraded";
  if (!state.hasCandidateP0 && state.directEvidenceCount === 0) return "evidence-needed";
  if (!state.hasCandidateP0) return "investigating";
  if (candidate.confidence === "high") return "validated";
  return "investigating";
}

function reviewCadenceDays(status: WatchlistStatus): number {
  if (status === "evidence-needed") return 3;
  if (status === "investigating") return 7;
  if (status === "validated") return 14;
  if (status === "downgraded") return 7;
  return 30;
}

function event(at: string, type: WatchlistEvent["type"], detail: string): WatchlistEvent {
  return { at, type, detail };
}

function trimEvents(events: WatchlistEvent[]): WatchlistEvent[] {
  return events.slice(-30);
}

function nextActions(candidate: Candidate): string[] {
  return [...new Set([...(candidate.trace.nextActions ?? []), ...candidate.trace.coverageGaps.slice(0, 3)])];
}

function fromCandidate(candidate: Candidate, now: string): WatchlistEntry {
  const status = classifyWatchlistStatus(candidate);
  const state = evidenceState(candidate);
  return {
    code: candidate.stock.code,
    name: candidate.stock.name,
    status,
    score: candidate.score,
    confidence: candidate.confidence,
    firstSeenAt: now,
    lastSeenAt: now,
    nextReviewAt: addDays(now, reviewCadenceDays(status)),
    evidenceState: state,
    coverageGaps: candidate.trace.coverageGaps,
    nextActions: nextActions(candidate),
    events: [
      event(
        now,
        "created",
        `Entered watchlist at score ${candidate.score.toFixed(1)} with ${state.hasCandidateP0 ? "candidate P0" : "no candidate P0"}.`,
      ),
      event(now, "review-scheduled", `Next review scheduled for ${addDays(now, reviewCadenceDays(status)).slice(0, 10)}.`),
    ],
    killCriteria: candidate.trace.killCriteria ?? [],
    catalysts: candidate.trace.catalysts ?? [],
  };
}

function updateEntry(existing: WatchlistEntry, candidate: Candidate, now: string): WatchlistEntry {
  const status = classifyWatchlistStatus(candidate);
  const state = evidenceState(candidate);
  const events = [...existing.events];
  if (existing.status !== status) events.push(event(now, "status-changed", `${existing.status} -> ${status}.`));
  if (Math.abs(existing.score - candidate.score) >= 5) events.push(event(now, "score-changed", `${existing.score.toFixed(1)} -> ${candidate.score.toFixed(1)}.`));
  if (existing.evidenceState.hasCandidateP0 !== state.hasCandidateP0) {
    events.push(event(now, "evidence-changed", `candidate P0 ${existing.evidenceState.hasCandidateP0 ? "removed" : "added"}.`));
  }
  events.push(event(now, "updated", `Seen in screen run at score ${candidate.score.toFixed(1)}.`));
  events.push(event(now, "review-scheduled", `Next review scheduled for ${addDays(now, reviewCadenceDays(status)).slice(0, 10)}.`));
  return {
    ...existing,
    name: candidate.stock.name,
    status,
    score: candidate.score,
    confidence: candidate.confidence,
    lastSeenAt: now,
    nextReviewAt: addDays(now, reviewCadenceDays(status)),
    evidenceState: state,
    coverageGaps: candidate.trace.coverageGaps,
    nextActions: nextActions(candidate),
    events: trimEvents(events),
    // Kill criteria and catalysts are pinned to first entry so due dates do not reset each run.
    killCriteria: existing.killCriteria ?? candidate.trace.killCriteria ?? [],
    catalysts: existing.catalysts ?? candidate.trace.catalysts ?? [],
  };
}

function downgradeMissing(existing: WatchlistEntry, run: ScreenRun): WatchlistEntry {
  if (existing.status === "archived" || existing.status === "validated") return existing;
  const alreadyMarked = existing.events.at(-1)?.detail.includes(run.runId);
  return {
    ...existing,
    status: "downgraded",
    events: alreadyMarked
      ? existing.events
      : trimEvents([...existing.events, event(run.generatedAt, "status-changed", `${existing.status} -> downgraded after missing ${run.runId}.`)]),
  };
}

export function updateWatchlistFromRun(run: ScreenRun, existing: WatchlistEntry[] = []): WatchlistEntry[] {
  const byCode = new Map(existing.map((entry) => [entry.code, entry]));
  const seen = new Set<string>();
  const updated: WatchlistEntry[] = [];
  for (const candidate of run.candidates) {
    seen.add(candidate.stock.code);
    const current = byCode.get(candidate.stock.code);
    updated.push(current ? updateEntry(current, candidate, run.generatedAt) : fromCandidate(candidate, run.generatedAt));
  }
  for (const entry of existing) {
    if (!seen.has(entry.code)) updated.push(downgradeMissing(entry, run));
  }
  return updated.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
}

export async function loadWatchlist(filePath = WATCHLIST_PATH): Promise<WatchlistEntry[]> {
  return readJsonFile<WatchlistEntry[]>(filePath, []);
}

export async function saveWatchlist(entries: WatchlistEntry[], filePath = WATCHLIST_PATH): Promise<void> {
  await writeJsonFile(filePath, entries);
}

export function renderWatchlistSummary(entries: WatchlistEntry[], now = new Date().toISOString()): string {
  if (entries.length === 0) return "Watchlist is empty.";
  return entries
    .slice(0, 20)
    .map((entry, index) => {
      const dueKills = (entry.killCriteria ?? []).filter((criterion) => criterion.dueDate <= now).length;
      const dueCatalysts = (entry.catalysts ?? []).filter((criterion) => criterion.dueDate <= now).length;
      const dueText = dueKills + dueCatalysts > 0 ? ` due[kill=${dueKills},cat=${dueCatalysts}]` : "";
      return `${index + 1}. ${entry.code} ${entry.name} - ${entry.score.toFixed(1)} ${entry.confidence} ${entry.status} P0=${
        entry.evidenceState.hasCandidateP0 ? "yes" : "no"
      } next=${entry.nextReviewAt.slice(0, 10)}${dueText}`;
    })
    .join("\n");
}
