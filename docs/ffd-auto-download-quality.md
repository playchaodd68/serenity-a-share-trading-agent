# FFD Auto-Download Quality Profile

This project uses FFD auto-download as a candidate-report inbox, not as automatic high-confidence RAG evidence.

## Operating Flow

1. Configure the FFD web page from `npm run ffd:rules`.
2. Point the downloader to `/Users/apple/Desktop/FFD研报库/_raw`.
3. Run `npm run reports:convert` after downloads land.
4. Run `npm run reports:review` and inspect the quality gate, extracted claims, and chunks.
5. Run `npm run reports:accept-quality` for all quality-gate-passing reports, or `npm run reports:accept -- <report-id>` for one report. Reports that pass without hard evidence, with missing institution metadata, or through adjacent-background rules carry downgrade and cross-check tags.
6. Run `npm run reports:organize-obsidian` to refresh the FFD Obsidian index pages and bidirectional links after accepted reports change.

Use `npm run reports:accept -- --force <report-id>` only for an explicit manual exception.

## Quality Gate

The quality gate is intentionally permissive but typed. Reports fail only when they are clearly off-profile. Accepted reports remain `P1 broker_report`, and may be hard-evidence reports, background/cycle reports, or adjacent-industry background reports.

Accepted FFD reports must:

- match one configured theme rule, a watchlist-company validation rule, or an adjacent-background rule;
- come from the head/specialist institution whitelist, the expanded industrial institution whitelist, or have missing institution metadata plus strong theme/signal evidence;
- include either depth signals such as depth/topic/industry-chain/framework/review/tracking or hard evidence signals such as customer/order/capacity/yield/gross margin/price cycle;
- avoid low-signal titles such as morning meeting notes, daily comments, short comments, strategy weeklies, and rating quick notes.

If a report lacks bottleneck evidence terms such as customer, order, capacity, yield, gross margin, technical route, substitution risk, or competitive landscape, it can still pass as background. If it matches MLCC/passives, power semiconductors, AI compute chips, or short-cycle optical-module company updates, it can pass as adjacent background. The importer adds `ffd-background-only`, `ffd-needs-p0-crosscheck`, and the matching rule id tags, and the review output shows downgrade flags such as missing institution or adjacent background.

All accepted FFD reports remain `P1 broker_report` sources. They can provide industry context, source leads, and corroborate a thesis, but high-confidence candidate conclusions still require candidate-level `P0` filings, announcements, or investor-response evidence.
