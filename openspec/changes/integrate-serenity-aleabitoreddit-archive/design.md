## Context

The agent already distills Serenity's public methodology (`leslieyeo/serenity-reply`, P1). The newer `yan-labs/serenity-aleabitoreddit` skill adds a thesis archive (5,857 tweets through 2026-06-08, four long articles, per-ticker theses, a track record). Its useful, stable signal is the **chokepoint taxonomy and lines of inquiry**, not the per-ticker US/HK calls. Those calls are social-derived opinions about non-A-share tickers and must never become A-share evidence.

The hard problem is **cross-market mapping**: turning a Serenity chokepoint thesis (named on a US/HK ticker) into the right A-share segment and candidate shortlist, under a strict evidence gate, without impersonating Serenity.

## Goals / Non-Goals

**Goals:**
- Register the thesis archive as an attributable P1 line-of-inquiry source.
- Add a concept-based (ticker-independent) chokepoint mapping library keyed to `DEFAULT_THEMES`.
- Resolve concept → segment → A-share constituents at runtime via FFD, scored by the unchanged methodology.
- Surface 国产替代 / geopolitical premium-discount and "no clean A-share equivalent" cases explicitly.
- Lock the evidence gate and non-impersonation boundary with tests + harness.

**Non-Goals:**
- Do not install or execute the external skill at runtime.
- Do not copy the archive (tweets/theses) into the repo.
- Do not let any US/HK per-ticker call act as A-share candidate evidence.
- Do not make any scoring-path function async, and do not let geopolitics inflate scores.

## Decisions

1. **All new logic lives in new modules that call the unchanged synchronous `scoreCandidate`.** This mirrors `screener.ts`. The hot scoring path (`scoreCandidate`, `relevantSourcesForCandidate`, `extractCandidateEvidence`, `matchThemes`, `summarizeEvidence`) stays synchronous — no `await import(...)` inside any of them.

2. **Concept library is ticker-independent.** `ChokePointConcept` stores only A-share segment keywords plus reference-only `globalExample`/`serenitySourceIds`. Concepts roll up to existing `DEFAULT_THEMES` via `matchedThemeIds`; `proposeThemeExtension()` extends the taxonomy when none fits, without stamping Serenity IDs into any scoring component.

3. **Runtime resolution via FFD.** `resolveConceptToAShares()` calls `ffd_industry_stocks` (fallback `ffd_screen_stocks`) on the concept's segment keywords, parses `result.json`, scores each constituent through the unchanged path, and records `resolutionGaps` when FFD returns nothing.

4. **Belt-and-suspenders boundary.** A real hole existed: the P2 social article `SERENITY-X-ARTICLE-SIVE-20260519` keyword-matched the `ai-optical-cpo` theme and could flow into a candidate's relevant clues. New synchronous `isSerenityFrameworkSource()` is added to `relevantSourcesForCandidate()` to close it. `buildChokePointProvenance()` partitions sources into `candidateLevelP0` / `corroboratingAShareSources` / `serenityContext` so Serenity material can only ever be framework context.

5. **Geopolitics is surfaced, never scored.** `geopoliticalNotes()` and `ChokePointMapStatus` carry the 国产替代 premium / export-control discount and the non-mappability outcome; `assessIndustryLogic()` and the `ScoreComponent` list are untouched.

## Invariants that MUST NOT change
- The high-confidence gate stays `expectedValueScore >= 70 && hasCandidateP0 && hasIndependentCorroboration`.
- `hasCandidateP0` continues to come from `isCandidateSpecificPrimarySource` (P0 + `primary` + candidate identity). Serenity sources never satisfy it.
- No Serenity source ID appears in any positive `ScoreComponent`.
- `METHODOLOGY_NOTE` keeps the distillation note, `推理出处分层`, and `不得以第一人称扮演 Serenity`.

## Risks / Trade-offs
- FFD constituent shape may vary → `parseFfdStocks()` is defensive (stocks/data/list, null-safe) and gaps are surfaced, not swallowed.
- Concept staleness → each concept carries `observedAt`/`expiresAt` for revisit.
- Over-mapping → `no-equivalent`/`unverifiable` are first-class outcomes; the agent reports the gap instead of forcing a match.

## Migration Plan
1. Add types + synchronous boundary guard.
2. Patch `relevantSourcesForCandidate`; extend `METHODOLOGY_NOTE`.
3. Add concept library + mapping module + agent tool.
4. Add tests + harness checks; run typecheck, tests, harness.

Rollback is a normal git revert of these files.
