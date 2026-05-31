## Overview

The project is a TypeScript research-agent service built around Pi's agent runtime. The first implementation target is a deterministic, auditable research harness that can run without model credentials; when model credentials are present, the same tool contracts can be exposed to a Pi `Agent` for conversational research.

The agent does not emit buy/sell instructions. It emits watchlist candidates, evidence chains, posterior confidence, risks, and source coverage gaps.

## Architecture

- `src/methodology/`: Serenity-derived chokepoint rubric, evidence taxonomy, scoring, and trace formatting.
- `src/connectors/`: Public data connectors for TopicDigg/X article captures, Eastmoney A-share market snapshots, local report/document manifests, and source registries.
- `src/rag/`: Obsidian folder creation and markdown/JSON index generation for RAG ingestion.
- `src/agent/`: Pi agent factory, system prompt, tool definitions, and deterministic tool implementations.
- `src/feishu/`: Webhook sender, callback verification, and command router.
- `src/harness/`: Scenario runner and assertions used by tests and code review.
- `src/cli.ts`: Commands for `init-obsidian`, `ingest-serenity`, `screen`, `feishu-server`, and `run-harness`.

## Data Flow

1. Source ingestion collects source metadata, short excerpts, and derived notes into `data/source-registry.json`.
2. Methodology extraction writes canonical notes and evidence taxonomy into the Obsidian RAG folder.
3. A-share screening fetches market snapshots and applies theme exposure plus Serenity-style evidence scoring.
4. Reports are generated with candidate scores, trace IDs, source IDs, source coverage gaps, and explicit risk flags.
5. Feishu notifications send the report summary; callback commands can trigger screening or explain a candidate.

## Methodology Model

The Serenity method is encoded as:

- Prior: industry-level structure, TAM shift, policy/capex tailwinds, and supply-chain position.
- Likelihood evidence: primary disclosures, customer mapping, capacity/yield signals, earnings-call validation, sell-side coverage, and price/volume confirmation.
- Negative evidence: substitution risk, capacity competition, dilution, customer insourcing, weak management, regulatory blocks, and crowding.
- Posterior: weighted confidence score with every contribution tied to a source ID.
- Expected-value gate: upside asymmetry must exceed evidence/risk thresholds before a candidate appears in a report.

## Source Strategy

Sources are tiered:

- P0 primary: company announcements, exchange filings, annual/interim reports, earnings transcripts, government policy, standards bodies.
- P1 industry: broker research, semiconductor/industrial chain databases, trade associations, technical papers, supplier/customer presentations.
- P2 market/social: X/Substack/雪球/富途/Reddit, only for clue discovery and diffusion monitoring.

No candidate is considered high confidence unless it has P0 evidence plus at least one independent P1/P2 corroboration.

## Feishu Design

- Outbound: `FEISHU_WEBHOOK_URL` receives markdown cards with candidate summaries and trace links.
- Inbound: Node HTTP callback server verifies `FEISHU_VERIFICATION_TOKEN`, handles `challenge`, and routes text commands.
- Commands: `/screen`, `/why <code>`, `/sources`, `/harness`.

## Operational Design

- Local schedule can be run with cron/GitHub Actions later through `npm run screen`.
- Logs are JSONL under `runs/`.
- Candidate reports are markdown under `reports/` and mirrored into Obsidian.
- Harness tests are mandatory before publishing.

## Constraints and Risks

- X access is unstable; ingestion keeps source IDs and derived notes, not a guaranteed complete verbatim archive.
- Sell-side reports often live behind licensed portals; the system supports local report manifests and PDF/markdown ingestion, but the user must provide licensed files.
- A-share public endpoints can change; connector tests validate shape and fail loudly.
- Financial outputs are research candidates, not investment advice or order automation.
