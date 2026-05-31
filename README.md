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
- Deterministic harness and tests

## Setup

```bash
npm install
cp .env.example .env
npm run ingest:serenity
npm run obsidian:init
npm run screen
npm run review
```

## Commands

- `npm run ingest:serenity`: seed source registry and capture accessible Serenity public post summaries.
- `npm run obsidian:init`: create the Obsidian RAG folder and source notes.
- `npm run screen`: fetch A-share market snapshot and write a candidate report under `reports/`.
- `npm run feishu:server`: start a Feishu callback server.
- `npm run review`: typecheck, unit tests, and deterministic harness.

## Feishu

Set `FEISHU_WEBHOOK_URL` to send screening summaries. Set `FEISHU_VERIFICATION_TOKEN` and expose `npm run feishu:server` for callback commands:

- `/screen`
- `/why <code>`
- `/sources`
- `/harness`

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
