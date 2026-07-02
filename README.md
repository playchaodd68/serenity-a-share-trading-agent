# Serenity A-share Trading Research Agent

Pi-based personal research agent for A-share industry bottleneck discovery. It implements a traceable version of Serenity's supply-chain chokepoint methodology, screens A-share candidates, can manually archive an Obsidian RAG knowledgebase, and can interact through Feishu.

This project emits research candidates and evidence traces. It does not place orders and does not provide personalized investment advice.

## What Is Implemented

- OpenSpec plan: `openspec/changes/serenity-a-share-trading-agent/`
- Pi agent factory: `src/agent/trading-agent.ts`
- Serenity methodology rubric: `src/methodology.ts`
- A-share snapshot connector: Eastmoney public market snapshot
- FFD MCP connector: local FinFlow Data tools for health checks, route planning, capabilities, quote history, intraday data, technical indicators, money flow, industry-cycle signals, macro/financial/announcement data, market intelligence, research search/detail/download, news search/latest, and natural-language data routing
- FFD report-library pipeline: converts downloaded PDF/MD/TXT reports into Markdown, summary cards, claims, chunks, and Obsidian staging notes before manual acceptance
- Obsidian RAG initializer: default `/Users/apple/Documents/HenryXu/Serenity-A股产业投研`
- Source registry: `data/source-registry.json`
- Feishu webhook/callback support
- Hermes trading subagent: CLI one-shot/REPL, HTTP API, and Feishu routes backed by the same Pi Agent state
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
- `npm run obsidian:init`: manually create or refresh the Obsidian RAG folder and source notes.
- `npm run screen`: fetch A-share market snapshot, write a candidate report, update watchlist, and persist evidence/graph snapshots.
- `npm run research:refresh`: refresh sources, screen report, watchlist, calibration, answer-safety evals, and doctor artifacts.
- `npm run watchlist`: print the current persistent research watchlist.
- `npm run calibration`: rebuild the latest calibration snapshot from historical screen reports.
- `npm run evals`: run deterministic high-risk trading-answer safety evals.
- `npm run reports:convert`: scan FFD downloader output, convert reports to Markdown, and write staging artifacts.
- `npm run reports:review`: list staged/accepted FFD report manifests, extracted summaries, and quality-gate results.
- `npm run reports:accept -- <report-id>`: accept one quality-gate-passing staged FFD report into the source registry as P1 broker evidence.
- `npm run reports:accept-quality`: accept all currently staged FFD reports that pass the local quality gate, merging source records sequentially and syncing Obsidian source notes.
- `npm run reports:accept -- --force <report-id>`: manually override the FFD report quality gate for an explicit exception.
- `npm run reports:reject -- <report-id>`: mark one staged FFD report as rejected.
- `npm run ffd:rules`: print the high-precision FFD auto-download rule profile for configuring the FFD web page.
- `FFD_API_KEY='<new key>' npm run ffd:set-key`: update the local FFD MCP config without printing the key.
- `npm run daily-run`: ingest sources, screen candidates, and run the runtime doctor.
- `npm run doctor`: check local runtime prerequisites and coverage gaps.
- `npm run cron`: print a weekday crontab example for `daily-run`.
- `npm run ffd:smoke`: run grouped FFD data-plane checks and write `runs/ffd-smoke-latest.json`.
- `npm run ffd:signal -- <mode> <query>`: archive one FFD realtime/structured signal into the Obsidian `signals/ffd/` folder.
- `npm run feishu:server`: start a Feishu callback server.
- `npm run feishu:event-relay`: consume Feishu bot events through `lark-cli` and forward them to the local callback server.
- `npm run feishu:poller`: poll the configured private Feishu chat and forward new user messages to the local callback server.
- `npm run agent`: print Pi agent model/tool metadata.
- `npm run hermes:metadata`: print Hermes trading subagent identity, methodology/capability coverage, model, prompt hash, tools, and Feishu commands.
- `npm run hermes:subagent -- --session <id> --message <question>`: run one Hermes trading subagent turn from a terminal or another agent.
- `npm run hermes:chat`: start the local terminal chatbot through the replicated trading-agent runtime.
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
npm run hermes:metadata
npm run hermes:subagent -- --session henry --message "用 Serenity 方法论筛选 A 股候选，并说明证据缺口"
npm run chat -- --session henry
```

`npm run hermes:subagent` is the one-shot Hermes subagent entrypoint. The REPL (`npm run chat` or `npm run hermes:chat`) and HTTP server use the same Pi agent factory, system prompt, tool list, session store, Chinese-normalization policy, and safety rules.

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

- `/ask <question>` or any natural-language message: chat with the Pi/DeepSeek trading agent
- `/trading <question>` or `/hermes <question>`: explicit aliases for the Hermes trading subagent
- `/hermes-metadata`: show the replicated subagent identity, model, prompt hash, capabilities, and tool list
- `/reset`: clear the current Feishu chat session transcript
- `/screen`
- `/research-refresh`
- `/ffd-health`
- `/ffd <query>`
- `/ffd-industry <query>`
- `/ffd-research <keyword>`
- `/ffd-news <keyword>`
- `/ffd-smoke`
- `/ffd-signal <mode> <query>`
- `/ffd-auto-rules`
- `/reports-convert`
- `/reports-review`
- `/reports-accept <id>` or `/reports-accept --force <id>`
- `/reports-accept-quality`
- `/reports-reject <id>`
- `/archive-obsidian`: manually refresh the Obsidian knowledgebase
- `/watchlist`
- `/calibration`
- `/evals`
- `/board <topic-or-mermaid>`: explicitly generate a Mermaid visual draft and optionally write it to a configured Feishu whiteboard
- `/latest`
- `/why <code>`
- `/sources`
- `/methodology`
- `/doctor`
- `/harness`

For a Feishu self-built app bot, configure:

```text
FEISHU_APP_ID=<app id>
FEISHU_APP_SECRET=<app secret>
FEISHU_REPORT_APP_ID=<optional report-only app id; falls back to FEISHU_APP_ID>
FEISHU_REPORT_APP_SECRET=<optional report-only app secret; falls back to FEISHU_APP_SECRET>
FEISHU_NOTIFY_OPEN_ID=<optional user open_id for private proactive bot notifications>
FEISHU_NOTIFY_CHAT_ID=<optional chat id for proactive bot notifications>
FEISHU_COMMAND_SENDER_OPEN_ID=<optional open_id allowed to command the bot in group chats; defaults to FEISHU_NOTIFY_OPEN_ID>
FEISHU_REPORT_NOTIFY_RECEIVE_ID_TYPE=<optional: union_id | open_id | user_id | email>
FEISHU_REPORT_NOTIFY_RECEIVE_ID=<optional report-only recipient id matching the type above>
FEISHU_REPORT_NOTIFY_OPEN_ID=<optional user open_id for private report-library notifications>
FEISHU_VERIFICATION_TOKEN=<event subscription verification token>
FEISHU_PORT=8787
FEISHU_DRY_RUN_REPLIES=false
FEISHU_REPLY_RENDER_MODE=text
FEISHU_WHITEBOARD_TOKEN=<optional existing Feishu whiteboard token for /board>
FEISHU_WHITEBOARD_AS=user
FEISHU_WHITEBOARD_OVERWRITE=false
FEISHU_LOCAL_CALLBACK_URL=http://127.0.0.1:8787
LARK_CLI_PROFILE=<optional lark-cli profile name>
LARK_CLI_BIN=<optional absolute lark-cli path for launchd/background services>
FEISHU_PRIVATE_CHAT_ID=<optional p2p chat id for private polling; falls back to FEISHU_NOTIFY_CHAT_ID>
FEISHU_POLLER_INTERVAL_MS=8000
FEISHU_POLLER_INITIAL_LOOKBACK_MINUTES=15
FEISHU_POLLER_STATE_PATH=runs/feishu-poller-state.json
```

Then run `npm run feishu:server` and expose `http://localhost:8787` through a public HTTPS tunnel. In Feishu developer console, enable the bot capability, subscribe to `im.message.receive_v1`, and set the event request URL to the tunnel URL. Leave event encryption disabled unless the server is extended with decrypt support.

For local callback routing tests without sending a real Feishu reply, run with `FEISHU_DRY_RUN_REPLIES=true`. The server will log the reply preview after routing through the Hermes trading subagent, but will not call the Feishu reply API.

The default Feishu reply renderer remains plain text. Set `FEISHU_REPLY_RENDER_MODE=post` to send replies as rich post messages with Markdown content, or `FEISHU_REPLY_RENDER_MODE=card` to send interactive cards. This only changes the Feishu message container; it does not change the trading agent answer template.

The `/board` command is opt-in visual output. When `FEISHU_WHITEBOARD_TOKEN` is unset, `/board <topic>` returns a Mermaid preview in chat. When the token is configured, it calls `lark-cli whiteboard +update` with `FEISHU_WHITEBOARD_AS` and appends to the board by default; set `FEISHU_WHITEBOARD_OVERWRITE=true` only when the command should replace existing board content.

If a public tunnel is unavailable or unstable, run the local event relay instead:

```bash
npm run feishu:server
npm run feishu:event-relay
```

The relay uses `lark-cli event consume im.message.receive_v1 --as bot`, so it requires the same self-built app bot to have the `im.message.receive_v1` event subscription and message-read permission enabled in the Feishu developer console. It forwards each received event to `FEISHU_LOCAL_CALLBACK_URL`; the existing callback server then runs the agent and replies through the Feishu IM API.

For private one-on-one operation without relying on Feishu event delivery, run the polling fallback:

```bash
npm run feishu:server
npm run feishu:poller
```

The poller reads new user messages from `FEISHU_PRIVATE_CHAT_ID` and forwards each unseen text message to the same callback path. It stores processed message IDs in `FEISHU_POLLER_STATE_PATH` to avoid duplicate replies.

In group chats, the Feishu bot only handles explicit slash commands or messages that mention the bot, and only from `FEISHU_COMMAND_SENDER_OPEN_ID` when configured. Ordinary group messages are acknowledged but ignored.

## FFD

The trading agent calls FFD through the local MCP server wrapper at:

```text
/Users/apple/.ffd/run_ffd_mcp.sh
```

The FFD API Key stays in the official local config file, not in this repository:

```text
/Users/apple/.ffd/mcp-config.json
```

Use `npm run doctor` or Feishu `/ffd-health` to verify the connection. The agent should use its FFD tools directly; it should not ask you to paste an API Key in chat or generate MCP JSON containing secrets.

If `npm run doctor` reports `ffd-data-plane status=api_key_disabled`, the local MCP config is using a disabled/deleted key. Open FFD's API Key 管理 page, reveal or create the current Trading Agent key, then update the local config from a terminal:

```bash
FFD_API_KEY='<new key>' npm run ffd:set-key
npm run doctor
npm run ffd:smoke
```

Do not send the key through Feishu or chat.

The agent exposes these FFD capability families:

- Routing and discovery: `ffd_route_plan`, `ffd_capabilities`, `ffd_functions`, `ffd_search_stocks`, `ffd_search_indicators`.
- Market and fermentation checks: `ffd_quote_history`, `ffd_stock_performance`, `ffd_intraday_quote`, `ffd_intraday_snapshot`, `ffd_technical_indicators`, `ffd_trading_signal`, `ffd_support_resistance`, `ffd_money_flow`.
- Industry and macro checks: `ffd_industry_signal`, `ffd_industry_overview`, `ffd_industry_stocks`, `ffd_industry_indicators`, `ffd_industry_indicator_data`, `ffd_macro_data`, `ffd_index_valuation`, `ffd_topic_report`.
- Company validation: `ffd_announcements`, `ffd_financial_metrics`, plus P0 filings from the CNINFO connector where available.
- Research and news: `ffd_research_search`, `ffd_research_detail`, `ffd_research_download` only when explicitly requested, `ffd_news_search`, `ffd_news_latest`, `ffd_market_intelligence`.

For nontrivial current-data questions, the intended order is: route with `ffd_route_plan` when uncertain, gather industry/company evidence, then use market/technical/intraday tools only to judge whether the thesis has already started to ferment in price and volume.

When a tool response starts with `FFD_RESULT_STATUS`, non-`ok` statuses such as `api_key_disabled`, `target_not_found`, or `data_error` must be treated as evidence coverage gaps. They do not mean the industry has no signal; they mean the requested FFD data plane or query route was not reliable enough for that conclusion.

Use `npm run ffd:smoke` or Feishu `/ffd-smoke` to verify the grouped FFD surfaces after a key change. The smoke check covers route planning, stock search, news, research library, industry signals, money flow, financial metrics, announcements, and quote history.

Archive high-value transient signals into Obsidian with:

```bash
npm run ffd:signal -- industry "半导体 存储芯片 行业景气"
npm run ffd:signal -- money "CPO概念今日主力资金净流入"
npm run ffd:signal -- quotes "002938.SZ 最近20个交易日表现"
```

Supported modes are `nl`, `route`, `news`, `research`, `industry`, `money`, `financial`, `announcements`, and `quotes`. Notes are written under `<Obsidian KB>/signals/ffd/` with tool name, query, status, result, and methodology caveats.

### FFD Report Library

The FFD desktop downloader should write licensed reports into:

```text
reports/ffd/raw
```

Run:

```bash
npm run reports:convert
npm run reports:review
npm run reports:accept-quality
```

PDF conversion tries `pymupdf4llm` first and falls back to local `pdftotext` from Poppler. The current machine has the `pdftotext` fallback available.

The converter writes:

```text
reports/ffd/processed/<report-id>/full.md
reports/ffd/processed/<report-id>/summary.md
reports/ffd/processed/<report-id>/claims.json
reports/ffd/processed/<report-id>/chunks.json
reports/ffd/processed/<report-id>/manifest.json
```

It also writes Obsidian staging notes under:

```text
<Obsidian KB>/reports/FFD/Staging/
```

Accepted reports are copied to:

```text
<Obsidian KB>/reports/FFD/Accepted/
```

Only accepted reports are added to `data/source-registry.json` as `P1` / `broker_report` evidence. Full converted Markdown is preserved for traceability, but the agent should prefer summary cards, extracted claims, and chunks before reading full Markdown.

Accepting a report also syncs the Obsidian `sources/source-registry.json` ledger and source cards, so the RAG folder remains aligned with the runtime source registry.

When `FEISHU_REPORT_NOTIFY_RECEIVE_ID` is configured, `npm run reports:convert` sends new-report summaries to that private Feishu user using `FEISHU_REPORT_NOTIFY_RECEIVE_ID_TYPE` (`union_id`, `open_id`, `user_id`, or `email`). The legacy `FEISHU_REPORT_NOTIFY_OPEN_ID` path remains supported and falls back to `FEISHU_NOTIFY_OPEN_ID` if the report-specific value is unset. Set `FEISHU_REPORT_APP_ID` and `FEISHU_REPORT_APP_SECRET` when using a dedicated report bot; otherwise the default Feishu app credentials are used.

For FFD's real-time push page, create a dedicated Feishu group for research alerts, add a Feishu custom bot to that group, and store the custom bot URL in `FFD_FEISHU_WEBHOOK_URL`. Configure FFD's push-subscription page to use Feishu real-time push with that webhook and keep email push disabled when group delivery is preferred.

Use `FEISHU_NOTIFY_CHAT_ID` for proactive trading-agent messages into the same dedicated group. Keep `FEISHU_COMMAND_SENDER_OPEN_ID` set to your own open_id so the trading agent ignores ordinary group chatter and only responds to your slash commands or direct mentions.

The `/ffd-report-relay/<token>` endpoint remains available as a fallback bridge when a platform requires a Feishu-compatible webhook response but you still want the agent to forward alerts itself. Set `FFD_REPORT_RELAY_TOKEN` only for that relay mode.

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

The knowledgebase initializer creates:

- `methodology/`: Serenity methodology plus Wiki evidence-governance rules.
- `reports/FFD/Staging/`: converted reports awaiting quality review.
- `reports/FFD/Accepted/`: FFD reports accepted into formal P1 RAG evidence.
- `signals/ffd/`: dated snapshots for realtime FFD outputs such as intraday, money-flow, industry indicators, news, and announcements when a transient signal should become durable context.
- `sources/`: `source-registry.json` and one card per registered source.
