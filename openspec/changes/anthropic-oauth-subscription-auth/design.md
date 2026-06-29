## Context

`@earendil-works/pi-ai@0.78.0` already implements the Anthropic OAuth provider and, in its anthropic stream provider, auto-detects OAuth tokens (`apiKey.includes("sk-ant-oat")`): it switches to `authToken` Bearer auth, injects `anthropic-beta: claude-code-20250219,oauth-2025-04-20`, prepends the required `"You are Claude Code…"` identity system block (keeping the agent's own system prompt), and remaps tool names to/from Claude Code canonical names. `agent-core` resolves the key per request via `config.getApiKey(provider)` (comment: "important for expiring tokens"). So the integration is purely: obtain + persist credentials, and feed a fresh token through `getApiKey`.

## Decisions

1. **Per-request token via `getApiKey`, not a static env var.** OAuth access tokens expire; resolving per request lets us refresh transparently. `ANTHROPIC_OAUTH_TOKEN` (static) remains supported as a fallback for advanced users.
2. **Return undefined for non-Anthropic providers.** This preserves the existing env-key fallback inside the provider, so DeepSeek (and Anthropic API-key) auth is unchanged.
3. **Local credential file, chmod 600, gitignored.** Default `runs/anthropic-oauth.json` (already covered by `runs/*.json`). Holds the refresh token, so permissions are owner-only.
4. **Injectable deps in the resolver.** `getFreshAnthropicAccessToken({ credentialsPath, now, refresh, save })` lets the refresh-and-persist path be unit-tested without network or wall-clock.
5. **Malformed credentials degrade gracefully.** Parse failure → treated as not-logged-in (undefined), so a corrupt file never crashes the agent; genuine IO errors still throw.

## Risks / Trade-offs
- OAuth subscription tokens are scoped to the Claude Code identity; pi-ai handles the identity headers/prompt, so the agent's custom prompt is preserved as a secondary system block.
- Model availability depends on the subscription plan; `claude-opus-4-6` is the newest Opus in this pinned pi-ai registry (Opus 4.8 would require upgrading the SDK).
- Token refresh requires network; failures surface as a clear refresh error at request time.

## Migration Plan
1. Add config + auth module.
2. Wire `getApiKey` into the agent.
3. Add CLI commands, scripts, and docs.
4. Tests + verification.

Rollback is a normal git revert; removing the credential file disables OAuth and falls back to env auth.
