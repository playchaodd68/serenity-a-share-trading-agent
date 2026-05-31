## Why

The user wants a durable personal trading-research agent that turns Serenity's supply-chain chokepoint method into a traceable A-share workflow, instead of relying on ad hoc social-media reading and unstructured notes. This matters now because the source corpus, A-share data, Feishu interaction, and Obsidian RAG store must be reproducible before any periodic monitoring or GitHub operations can be trusted.

## What Changes

- Build a Pi-based agent harness with domain tools for methodology retrieval, A-share screening, source ingestion, evidence tracing, report generation, and Feishu interaction.
- Codify Serenity's method as a strict, source-linked research rubric: map industry structure, identify bottlenecks, form priors, update with evidence, score expected value, and emit risks.
- Add connectors for accessible Serenity/X article data, A-share market snapshots, company/source metadata, sell-side report manifests, and local document ingestion into an Obsidian-backed RAG folder.
- Add scheduled and interactive workflows so the agent can run periodic screens and answer Feishu commands in real time.
- Add a deterministic harness and tests covering scoring, traceability, source registration, Feishu signature handling, and report output quality gates.
- Add operational docs, environment configuration, and GitHub-ready repository structure for long-term maintenance.

## Capabilities

### New Capabilities
- `serenity-methodology`: Defines the traceable investment method, evidence taxonomy, Bayesian update model, scoring rubric, and audit trail requirements.
- `a-share-discovery`: Screens A-share candidates by industry theme, bottleneck exposure, market data, evidence quality, and risk constraints.
- `rag-knowledgebase`: Creates and maintains the Obsidian knowledgebase structure, source registry, and report/high-quality-information ingestion workflow.
- `feishu-interaction`: Supports Feishu webhook notifications and command callbacks for real-time agent interaction.
- `agent-harness`: Provides Pi agent construction, tool contracts, deterministic scenario tests, and code-review gates.
- `operations-monitoring`: Provides schedule/runbook artifacts for recurring screening, logs, alerts, and GitHub maintenance.

### Modified Capabilities

None.

## Impact

- New TypeScript application at the repository root.
- Runtime dependencies on `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `typebox`, `dotenv`, and `zod`.
- Local source-of-truth folders under `data/`, `docs/`, `src/`, `tests/`, and `openspec/`.
- Generated Obsidian folder under `/Users/apple/Documents/HenryXu/Serenity-A股产业投研` by default, configurable via `OBSIDIAN_VAULT_PATH`.
- Optional external integrations: OpenAI-compatible model credentials, Feishu webhook/callback secrets, report/PDF source folders, and public market-data endpoints.
