## Why

The project already distills Serenity's public methodology (via `leslieyeo/serenity-reply`, registered as P1 methodology input). A newer, more complete Agent Skill — `yan-labs/serenity-aleabitoreddit` — packages a thesis archive distilled from 5,857 Serenity tweets (through 2026-06-08), four long-form articles, a per-ticker thesis base, and a dated track record. Its value is not the per-ticker US/HK calls themselves (those are social-derived opinions about non-A-share tickers) but the **chokepoint taxonomy and lines of inquiry** it exposes: optical/CPO lasers, InP/compound-semi substrates, memory/HBM, AI power & grid, optical connectors, advanced packaging.

The open problem is **cross-market mapping**: Serenity trades US/HK tickers, but this agent serves A-share. We need a disciplined way to turn a Serenity chokepoint thesis into the right A-share segment and candidate shortlist, without (a) treating the US-tweet-derived thesis as A-share candidate evidence, or (b) impersonating Serenity.

## What Changes

- Register `yan-labs/serenity-aleabitoreddit` as an external methodology/thesis-archive source, attributed and treated as a P1 framework / line-of-inquiry input — never as candidate-level company evidence.
- Add a concept-based **chokepoint mapping library** to the canonical methodology: each chokepoint is concept-keyed (not ticker-keyed), mapped to the existing `DEFAULT_THEMES` taxonomy and to A-share segment keywords, with the 国产替代 / geopolitical premium-discount dimension and explicit "no clean A-share equivalent" handling.
- Extend the canonical methodology note with a `跨市场卡点映射框架 (A 股映射)` section describing the concept → segment → A-share-constituent path and its evidence gate.
- Add an agent tool that turns a chokepoint concept into A-share themes/segment keywords and a research line of inquiry (not a buy list), preserving the existing FFD constituent-resolution flow.
- Update the agent prompt so the thesis archive is used as a line-of-inquiry generator only, with non-impersonation and "US thesis ≠ A-share evidence" boundaries.
- Add regression coverage: source registration, methodology content, mapping invariants, and the preserved P0 evidence gate.

## Capabilities

### New Capabilities
- `cross-market-chokepoint-mapping`: Covers mapping Serenity-derived chokepoint concepts onto A-share themes/segments and A-share candidates under a strict evidence gate.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/methodology.ts`, `src/sources/seed.ts`, `src/agent/trading-agent.ts`, tests, and harness checks.
- No new runtime dependency.
- Feishu/chat behavior changes only through the existing agent prompt, methodology tool output, and the new mapping tool.
