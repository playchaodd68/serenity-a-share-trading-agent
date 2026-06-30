import type { SourceRecord } from "../types.js";

const SERENITY_FRAMEWORK_TAGS = new Set([
  "methodology-distillation",
  "thesis-archive",
  "line-of-inquiry",
  "chokepoint-taxonomy",
  "non-impersonation",
]);

/**
 * True for any Serenity-derived framework / social source that must never serve as
 * candidate-level evidence. Pure and synchronous, so it can be used inside the
 * synchronous scoring path (relevantSourcesForCandidate) without making it async.
 *
 * This is a belt-and-suspenders guard: it closes the hole where a Serenity P2
 * social post (e.g. SERENITY-X-ARTICLE-SIVE, tagged CPO/photonics) keyword-matches
 * a theme and would otherwise flow into a candidate's relevant clues.
 */
export function isSerenityFrameworkSource(source: SourceRecord): boolean {
  if (/^SERENITY[-_]/i.test(source.id)) return true;
  if (source.publisher?.toLowerCase().includes("serenity")) return true;
  if (source.evidenceTags.some((tag) => SERENITY_FRAMEWORK_TAGS.has(tag))) return true;
  if (source.evidenceTags.includes("Serenity") && source.sourceType === "social") return true;
  return false;
}
