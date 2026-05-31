# Source Strategy

## Required Coverage

- Company filings and announcements: exchange, CNINFO, company IR pages.
- Financials and market snapshot: public market endpoints first; licensed vendor adapters can be added.
- Sell-side research: user-provided licensed PDFs/notes in `REPORT_INBOX`.
- Industry/technical: trade bodies, standards, technical papers, conference slides, supplier/customer presentations.
- Social/media: X, 雪球, 富途, Reddit, Substack only as clue and diffusion sources.

## Confidence Gate

- High: P0 + independent P1/P2 corroboration + positive evidence updates + explicit downside risks.
- Medium: theme and market evidence plus P1/P2 support, but incomplete P0.
- Low: social/market clue only, missing primary validation.

Generic P0 directories such as CNINFO, SSE, SZSE, and investor-relation portals are only source-entry registries. They do not count as candidate-level P0 evidence until a specific company filing, exchange announcement, annual report, or investor-response record is registered for that candidate or bottleneck.

## Operating Discipline

- Run `npm run ingest:serenity` after adding licensed reports to `REPORT_INBOX`.
- Run `npm run doctor` before trusting a new report; warnings about missing P0 evidence mean outputs remain research candidates only.
- Use Feishu `/why <code>` to inspect the exact prior, posterior, component scores, risks, and coverage gaps from the latest JSON report.
