# Serenity A-share Trading Research Agent

Pi-based personal research agent for A-share industry bottleneck discovery. It implements a traceable version of Serenity's supply-chain chokepoint methodology, writes an Obsidian RAG knowledgebase, screens A-share candidates, and can interact through Feishu.

This project emits research candidates and evidence traces. It does not place orders and does not provide personalized investment advice.

## What Is Implemented

- OpenSpec plan: `openspec/changes/serenity-a-share-trading-agent/`
- Pi agent factory: `src/agent/trading-agent.ts`
- Serenity methodology rubric: `src/methodology.ts`
- A-share snapshot connector: Eastmoney public market snapshot
- Obsidian RAG initializer: default `/Users/apple/Documents/HenryXu/Serenity-A股产业投研`
- Source registry: `data/source-registry.json`
- Feishu webhook/callback support
- Hermes-style local chatbot: CLI REPL and HTTP API backed by Pi Agent state
- Default live model: DeepSeek V4 Pro through Pi's `deepseek` provider
- Deterministic harness and tests

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set DEEPSEEK_API_KEY
npm run ingest:serenity
npm run obsidian:init
npm run screen
npm run doctor
npm run review
```

## Commands

- `npm run ingest:serenity`: seed source registry and capture accessible Serenity public post summaries.
- `npm run obsidian:init`: create the Obsidian RAG folder and source notes.
- `npm run screen`: fetch A-share market snapshot and write a candidate report under `reports/`.
- `npm run daily-run`: ingest sources, refresh Obsidian, screen candidates, and run the runtime doctor.
- `npm run doctor`: check local runtime prerequisites and coverage gaps.
- `npm run cron`: print a weekday crontab example for `daily-run`.
- `npm run feishu:server`: start a Feishu callback server.
- `npm run agent`: print Pi agent model/tool metadata.
- `npm run chat`: start a local terminal chatbot using the Pi agent runtime.
- `npm run chat:server`: start a local HTTP chatbot at `http://localhost:8788`.
- `npm run review`: typecheck, unit tests, and deterministic harness.

## Local Chatbot

The live agent defaults to:

```text
TRADING_AGENT_MODEL_PROVIDER=deepseek
TRADING_AGENT_MODEL=deepseek-v4-pro
DEEPSEEK_API_KEY=<your key>
```

Terminal mode:

```bash
npm run chat -- --session henry
```

HTTP mode:

```bash
npm run chat:server
curl -X POST http://localhost:8788/chat \
  -H 'content-type: application/json' \
  -d '{"sessionId":"henry","message":"用 Serenity 方法论筛选 A 股候选，并说明证据缺口"}'
```

The browser UI is available at `http://localhost:8788/`. Session transcripts are persisted under `runs/chat-sessions/` so the same session can keep context across restarts.

## Feishu

Set `FEISHU_WEBHOOK_URL` to send screening summaries. Set `FEISHU_VERIFICATION_TOKEN` and expose `npm run feishu:server` for callback commands:

- `/screen`
- `/latest`
- `/why <code>`
- `/sources`
- `/methodology`
- `/doctor`
- `/harness`

## Operations

For long-running monitoring, run `npm run cron` and install the printed crontab after editing the time if needed. `daily-run` appends operational evidence to `runs/`, writes fresh Markdown/JSON reports under `reports/`, and optionally sends Feishu notifications when `FEISHU_WEBHOOK_URL` is configured.

## Source Tiers

- `P0`: primary source, such as company filing, exchange announcement, annual report, regulator, standards body.
- `P1`: industry or sell-side research, licensed local report, technical paper, reputable industry dataset.
- `P2`: social/media/market clue, including X, mirrors, forums, and market snapshot clues.

High confidence candidates require P0 evidence and independent corroboration. Without P0 evidence, confidence is capped.

## GitHub References Used

- [earendil-works/pi](https://github.com/earendil-works/pi): Pi agent runtime/harness base.
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec): spec-driven planning.
- Relevant finance-agent landscape scanned: OpenBB, TradingAgents-CN, A-share investment-agent forks, financial-research-analyst-agent, and daily stock-analysis Feishu skills.

## Obsidian Folder

Default target:

```text
/Users/apple/Documents/HenryXu/Serenity-A股产业投研
```

Override with:

```bash
OBSIDIAN_VAULT_PATH=/path/to/vault
OBSIDIAN_KB_FOLDER=Serenity-A股产业投研
```
