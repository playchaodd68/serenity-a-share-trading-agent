## Context

Current reports can explain why a stock matched a theme, but they cannot yet prove a candidate-specific supply-chain bottleneck. The production pipeline should make every candidate researchable as a stateful object: sources produce evidence, evidence forms relationships, relationships support or weaken bottleneck claims, and the watchlist tracks what needs review next.

## Goals / Non-Goals

**Goals:**
- Create structured, testable data contracts for evidence items, graph edges, watchlist entries, and evaluation outcomes.
- Preserve strict evidence tiers and require candidate-level P0 evidence for high confidence.
- Make reports and Feishu commands more actionable by showing evidence state and next research tasks.
- Keep all initial implementation deterministic so the harness can run without external paid data.

**Non-Goals:**
- Do not place trades or generate allocation instructions.
- Do not rely on unofficial APIs as the only path to P0 proof.
- Do not require paid broker or financial database credentials.
- Do not claim completion of live production hosting until fixed HTTPS/process supervision is verified.

## Decisions

1. Build a deterministic core before live connectors.

   Evidence extraction, graph construction, watchlist updates, and evals can work from existing `SourceRecord` records plus local files. Live CNINFO/SSE/SZSE connectors can plug into the same contracts later.

2. Store generated research state as JSON artifacts.

   Runtime artifacts belong under `data/` or `runs/`: watchlist state, evidence snapshots, graph snapshots, calibration results, and eval outputs. This keeps the source tree clean and makes operational review easy.

3. Treat P0 as candidate-specific only.

   Primary-source portals remain registries. A P0 source counts only when its id/title/summary/tags mention the candidate code/name or a concrete product relationship.

4. Keep scoring conservative.

   New evidence can improve explanations immediately, but confidence should remain capped unless P0 and independent corroboration exist.

## Risks / Trade-offs

- Heuristic extraction can miss subtle evidence -> keep extracted snippets conservative and expose coverage gaps.
- Relationship graphs can overstate weak associations -> edges must carry source IDs, tier, polarity, and confidence.
- Watchlist automation can create stale state -> doctor should flag stale reviews and stale screen runs.
- Live official connectors can be brittle -> deterministic local ingestion remains the fallback.
