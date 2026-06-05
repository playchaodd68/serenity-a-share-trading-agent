## Why

The project already uses a Serenity-derived supply-chain chokepoint method, but the local methodology is still coarse and mostly framed around evidence tiers and A-share screening. The `leslieyeo/serenity-reply` repository distills additional stable methodology, limitations, and safety boundaries that can strengthen the agent without turning it into a Serenity impersonation bot.

## What Changes

- Register the external `serenity-reply` repository as a methodology source, with attribution and clear treatment as P1 distillation material rather than primary company evidence.
- Extend the canonical methodology note with stable distilled concepts: chokepoint game theory, NVIDIA signal reading, asymmetric information, geopolitical discount/premium, and explicit failure modes.
- Add reasoning provenance rules so agent answers distinguish direct evidence, multi-source synthesis, framework extrapolation, and unsupported gaps.
- Update agent behavior to use the distillation as a research framework only, while prohibiting first-person impersonation and direct trading instructions.
- Add regression coverage for methodology content, source registration, and safety boundaries.

## Capabilities

### New Capabilities
- `methodology-distillation-input`: Covers ingestion and use of external methodology distillation material as a bounded research input.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/methodology.ts`, `src/sources/seed.ts`, `src/agent/trading-agent.ts`, tests, and harness checks.
- No new runtime dependency is expected.
- Feishu/chat behavior changes through the existing agent prompt and methodology tool output.
