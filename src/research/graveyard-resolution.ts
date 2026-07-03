import type { CandidateResolution, GraveyardEntry, GraveyardSummary } from "../types.js";
import { attachGraveyardOutcomes, loadGraveyard, saveGraveyard, summarizeGraveyard } from "./graveyard.js";
import { buildResolutionInputsFromGraveyard } from "./resolution-provider.js";
import { RESOLUTIONS_PATH, loadResolutions, resolveCandidates, saveResolutions } from "./resolution.js";
import type { PriceReturnProvider } from "./resolution.js";

// Graveyard fulfillment loop (2026-07-03 持仓误判复盘的兑现侧): buried entries whose
// horizon has elapsed get their realized alpha measured against the same benchmark and
// deadband as watchlist theses, then written back so summarizeGraveyard().buriedHitRate
// (错杀率: validated = 被拒标的跑出正超额 = 系统错杀) finally has data behind it.
//
// Ledger policy: graveyard resolutions are appended to runs/resolutions.json with
// origin:"graveyard" for auditability, but buildResolutionCalibration filters that
// origin out — rejection verification feeds buriedHitRate only and never distorts the
// watchlist posterior calibration (see the comment in resolution.ts).

export interface GraveyardResolutionOptions {
  resolutionsPath?: string;
  horizonDays?: number;
}

export interface GraveyardResolutionResult {
  /** Entries whose horizon elapsed, minus those already on the resolutions ledger. */
  dueCount: number;
  /** Entries the provider actually produced an observation for (skips stay unresolved). */
  resolvedCount: number;
  graveyard: GraveyardEntry[];
  summary: GraveyardSummary;
  /** Fresh graveyard-origin resolutions appended to the ledger this run. */
  resolutions: CandidateResolution[];
}

function ledgerKey(item: { origin?: CandidateResolution["origin"]; code: string; entryDate: string }): string {
  return `${item.origin ?? "watchlist"}:${item.code}:${item.entryDate.slice(0, 10)}`;
}

export async function resolveGraveyardOutcomes(
  graveyardPath: string,
  provider: PriceReturnProvider,
  now: string,
  options: GraveyardResolutionOptions = {},
): Promise<GraveyardResolutionResult> {
  const resolutionsPath = options.resolutionsPath ?? RESOLUTIONS_PATH;
  const graveyard = await loadGraveyard(graveyardPath);
  const inputs = buildResolutionInputsFromGraveyard(graveyard, now, { horizonDays: options.horizonDays });

  // Belt and braces on top of the outcomeLabel filter: if a previous run resolved an
  // entry but the graveyard write-back was lost, the ledger still prevents duplicates.
  const existing = await loadResolutions(resolutionsPath);
  const resolvedKeys = new Set(existing.map(ledgerKey));
  const dueInputs = inputs.filter((input) => !resolvedKeys.has(ledgerKey(input)));

  if (dueInputs.length === 0) {
    const summary = summarizeGraveyard(graveyard);
    return { dueCount: 0, resolvedCount: 0, graveyard, summary, resolutions: [] };
  }

  const fresh = await resolveCandidates(dueInputs, provider, { now });
  const updated = attachGraveyardOutcomes(graveyard, fresh);
  await saveGraveyard(updated, graveyardPath);
  await saveResolutions([...existing, ...fresh], resolutionsPath);

  return {
    dueCount: dueInputs.length,
    resolvedCount: fresh.length,
    graveyard: updated,
    summary: summarizeGraveyard(updated),
    resolutions: fresh,
  };
}

export function renderGraveyardResolutionResult(result: GraveyardResolutionResult): string {
  const rate = result.summary.buriedHitRate;
  return [
    `Graveyard resolution: due=${result.dueCount}, resolved=${result.resolvedCount} (skips stay unresolved; no fabricated data).`,
    `错杀率 buriedHitRate=${rate == null ? "n/a" : (rate * 100).toFixed(1) + "%"} over ${result.summary.resolvedWithOutcome} decided burials.`,
  ].join("\n");
}
