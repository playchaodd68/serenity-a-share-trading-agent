# Source Strategy

## Required Coverage

- Company filings and announcements: exchange, CNINFO, company IR pages.
- Financials and market snapshot: public market endpoints first; licensed vendor adapters can be added.
- Sell-side research: user-provided licensed PDFs/notes in `REPORT_INBOX`.
- FFD auto-downloaded sell-side research: high-precision FFD candidates land in `reports/ffd/raw`, are converted into Obsidian Staging, and only become accepted P1 broker evidence after the local quality gate and `reports:accept`.
- FFD realtime and structured APIs: quote history, intraday, technical indicators, money flow, industry indicators, macro data, financial metrics, announcements, news, and research metadata. These are tool outputs with freshness requirements; durable observations should be written to `signals/ffd/` with tool name, query, timestamp, and linked Source IDs.
- Industry/technical: trade bodies, standards, technical papers, conference slides, supplier/customer presentations.
- Social/media: X, 雪球, 富途, Reddit, Substack only as clue and diffusion sources.

## Confidence Gate

- High: P0 + independent P1/P2 corroboration + positive evidence updates + explicit downside risks.
- Medium: theme and market evidence plus P1/P2 support, but incomplete P0.
- Low: social/market clue only, missing primary validation.

Generic P0 directories such as CNINFO, SSE, SZSE, and investor-relation portals are only source-entry registries. They do not count as candidate-level P0 evidence until a specific company filing, exchange announcement, annual report, or investor-response record is registered for that candidate or bottleneck.

Accepted FFD broker reports remain P1 corroboration. They can strengthen industry-chain and broker validation, but they cannot replace candidate-level P0 disclosures for high-confidence conclusions.

FFD realtime outputs remain market or industry-signal evidence unless converted into a registered source. Use them to answer "是否已经启动/发酵", "景气度是否改善", and "资金/新闻是否扩散"; do not use them alone to prove the underlying supply-chain bottleneck.

If a tool response starts with `FFD_RESULT_STATUS`, record that status in the evidence trail. `api_key_disabled`, `target_not_found`, `data_error`, and `empty_data` are coverage limitations, not negative industry evidence.

## FFD Routing Discipline

- If the correct FFD tool is unclear, call `ffd_route_plan` or inspect `ffd_capabilities`/`ffd_functions` first.
- Industry thesis: use `ffd_industry_signal`, `ffd_industry_overview`, `ffd_industry_indicators`, and `ffd_industry_indicator_data`, then cross-check news/research and money flow.
- Candidate validation: use `ffd_announcements`, `ffd_financial_metrics`, accepted FFD P1 reports, and candidate-level P0 filings where available.
- Market fermentation/backcheck: use `ffd_quote_history`, `ffd_stock_performance`, `ffd_technical_indicators`, `ffd_support_resistance`, and `ffd_money_flow`; reserve `ffd_intraday_quote`/`ffd_intraday_snapshot` for explicit intraday questions.
- Research library: use `ffd_research_search` and `ffd_research_detail` freely for metadata; use `ffd_research_download` only when the user explicitly asks to download or archive a licensed report.

## Operating Discipline

- Run `npm run ingest:serenity` after adding licensed reports to `REPORT_INBOX`.
- Run `npm run reports:accept-quality` after `reports:review` when staged FFD reports pass the local quality gate.
- Run `npm run doctor` before trusting a new report; warnings about missing P0 evidence mean outputs remain research candidates only.
- Use Feishu `/why <code>` to inspect the exact prior, posterior, component scores, risks, and coverage gaps from the latest JSON report.
