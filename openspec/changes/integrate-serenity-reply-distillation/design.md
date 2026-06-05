## Context

The current agent has a concise Serenity-style methodology note, source tiers, candidate scoring, and Feishu/chat commands. The external `serenity-reply` repository is not a data feed or a trading model; it is a distilled interpretation of Serenity's public framework, including its limitations and safety rules.

The integration should strengthen the stable methodology layer while keeping the project traceable and conservative. The agent must not role-play Serenity or claim the external distillation as primary market evidence.

## Goals / Non-Goals

**Goals:**
- Register the external distillation as a source with attribution and bounded evidence semantics.
- Extend the canonical methodology note with stable concepts and explicit limitations.
- Add reasoning provenance rules for answers and reports.
- Add tests that lock in the intended safety boundary.

**Non-Goals:**
- Do not install or execute the external Agent Skill at runtime.
- Do not copy the full external skill into the repository.
- Do not add current market pulse data as stable methodology.
- Do not make the agent impersonate Serenity or provide direct trade instructions.

## Decisions

1. Treat `serenity-reply` as P1 methodology distillation, not P0 company evidence.

   P0 evidence remains company filings, exchange disclosures, investor relations, and regulator sources. The external repo can support framework design and risk prompts, but cannot prove that an A-share candidate controls a bottleneck.

2. Extend `METHODOLOGY_NOTE` instead of creating a separate runtime module.

   The existing agent, Obsidian initializer, Feishu `/methodology`, and methodology tool already depend on `methodologySummary()`. Updating the canonical note keeps behavior consistent across all surfaces.

3. Put safety behavior in the system prompt and tests.

   The agent should use third-person research framing: "Serenity-derived framework", not "I am Serenity". High-risk requests should remain bounded by research-only output and no allocation guidance.

4. Add targeted regression checks instead of broad persona evals.

   The external repo includes persona evals, but this project needs narrower checks: source registration, methodology content, and prompt boundaries.

## Risks / Trade-offs

- External distillation could overfit to a KOL persona → Mitigation: third-person framework framing only, no role-play mode.
- Social or distilled sources could be mistaken for company evidence → Mitigation: explicitly classify as P1/P2 methodology inputs and require P0 for high-confidence candidate claims.
- The note could become too verbose for chat usage → Mitigation: add compact sections and keep detailed market pulse out of the stable note.
- MIT attribution could be lost if content is copied → Mitigation: reference the repo as a source and avoid bulk copying.

## Migration Plan

1. Add source registry records for the external distillation and its evaluation material.
2. Update methodology and agent prompt.
3. Add tests and harness checks.
4. Run typecheck, tests, and harness.

Rollback is a normal git revert of the methodology/source/test changes.
