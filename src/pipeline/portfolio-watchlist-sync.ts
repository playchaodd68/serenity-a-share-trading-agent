import type { Portfolio, PortfolioPosition } from "../portfolio/portfolio.js";
import type { WatchlistEntry, WatchlistEvent, WatchlistStatus } from "../types.js";

// Portfolio -> watchlist forced coverage (2026-07-03 持仓误判复盘). The research
// pipeline must cover every actual holding so "没读过" can never render as a red
// verdict again. This is a one-way coverage bridge, not a firewall breach: no
// position data (weight/cost/shares) flows into the entry — only the code/name —
// so holdings still cannot act as evidence or influence any score.

export const PORTFOLIO_SYNC_NOTE = "持仓强制跟踪：研究流水线必须覆盖实际持仓（portfolio-sync）。";

const NEW_ENTRY_REVIEW_DAYS = 3;
const MAX_HOLDING_REVIEW_DAYS = 7;
const MAX_EVENTS = 30;

export interface PortfolioWatchlistSyncResult {
  watchlist: WatchlistEntry[];
  changed: boolean;
  added: Array<{ code: string; name: string }>;
  reactivated: Array<{ code: string; name: string }>;
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function event(at: string, type: WatchlistEvent["type"], detail: string): WatchlistEvent {
  return { at, type, detail };
}

function trimEvents(events: WatchlistEvent[]): WatchlistEvent[] {
  return events.slice(-MAX_EVENTS);
}

function forcedEntry(position: PortfolioPosition, now: string): WatchlistEntry {
  const nextReviewAt = addDays(now, NEW_ENTRY_REVIEW_DAYS);
  return {
    code: position.code,
    name: position.name ?? position.code,
    status: "evidence-needed",
    score: 0,
    confidence: "low",
    firstSeenAt: now,
    lastSeenAt: now,
    nextReviewAt,
    evidenceState: { hasCandidateP0: false, directEvidenceCount: 0, corroboratingEvidenceCount: 0, riskEvidenceCount: 0 },
    coverageGaps: [],
    nextActions: [PORTFOLIO_SYNC_NOTE],
    events: [
      event(now, "created", PORTFOLIO_SYNC_NOTE),
      event(now, "review-scheduled", `Next review scheduled for ${nextReviewAt.slice(0, 10)}.`),
    ],
    killCriteria: [],
    catalysts: [],
  };
}

// Mirrors classifyWatchlistStatus semantics for an entry that has no fresh Candidate:
// no candidate P0 and no direct evidence means "没读过", not "研究中".
function reactivatedStatus(entry: WatchlistEntry): WatchlistStatus {
  if (!entry.evidenceState.hasCandidateP0 && entry.evidenceState.directEvidenceCount === 0) return "evidence-needed";
  return "investigating";
}

function reactivate(entry: WatchlistEntry, now: string): WatchlistEntry {
  const status = reactivatedStatus(entry);
  return {
    ...entry,
    status,
    events: trimEvents([...entry.events, event(now, "status-changed", `${entry.status} -> ${status}：${PORTFOLIO_SYNC_NOTE}`)]),
  };
}

// Holdings must be reviewed at high frequency; a review scheduled beyond now+7d is
// pulled back to now+7d. Anything already tighter is left alone.
function tightenReview(entry: WatchlistEntry, now: string): WatchlistEntry {
  const cap = addDays(now, MAX_HOLDING_REVIEW_DAYS);
  if (entry.nextReviewAt <= cap) return entry;
  return {
    ...entry,
    nextReviewAt: cap,
    events: trimEvents([
      ...entry.events,
      event(now, "review-scheduled", `持仓复核收紧：${entry.nextReviewAt.slice(0, 10)} -> ${cap.slice(0, 10)}（portfolio-sync）。`),
    ]),
  };
}

export function syncPortfolioIntoWatchlist(
  portfolio: Portfolio,
  watchlist: WatchlistEntry[],
  now: string,
): PortfolioWatchlistSyncResult {
  const byCode = new Map(watchlist.map((entry) => [entry.code, entry]));
  const added: PortfolioWatchlistSyncResult["added"] = [];
  const reactivated: PortfolioWatchlistSyncResult["reactivated"] = [];
  const appended: WatchlistEntry[] = [];
  let changed = false;

  for (const position of portfolio.positions) {
    const existing = byCode.get(position.code);
    if (existing == null) {
      const entry = forcedEntry(position, now);
      byCode.set(entry.code, entry);
      appended.push(entry);
      added.push({ code: entry.code, name: entry.name });
      changed = true;
      continue;
    }
    let next = existing;
    // "downgraded" included: downgradeMissing marks any holding absent from a screen
    // run as downgraded, and updateGraveyard would then bury it as an active reject
    // (red on the panel) even though nobody read it. Sync runs before the burial step,
    // so pulling both statuses back into forced coverage breaks that loop.
    if (next.status === "archived" || next.status === "downgraded") {
      next = reactivate(next, now);
      reactivated.push({ code: next.code, name: next.name });
    }
    next = tightenReview(next, now);
    if (next !== existing) {
      byCode.set(next.code, next);
      changed = true;
    }
  }

  if (!changed) return { watchlist, changed: false, added, reactivated };
  return {
    watchlist: [...watchlist.map((entry) => byCode.get(entry.code) ?? entry), ...appended],
    changed: true,
    added,
    reactivated,
  };
}
