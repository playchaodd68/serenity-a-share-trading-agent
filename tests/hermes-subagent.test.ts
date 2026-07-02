import { describe, expect, it } from "vitest";
import { TRADING_AGENT_SYSTEM_PROMPT } from "../src/agent/trading-agent.js";
import {
  HERMES_TRADING_SUBAGENT_ID,
  buildHermesTradingSubagentMetadata,
  createHermesTradingSubagentSession,
  renderHermesTradingSubagentMetadata,
} from "../src/hermes/trading-subagent.js";
import { createHermesTradingFeishuRouter } from "../src/hermes/feishu-subagent.js";

describe("Hermes trading subagent", () => {
  it("replicates the live trading agent metadata and command surface", async () => {
    const previousProvider = process.env.TRADING_AGENT_MODEL_PROVIDER;
    const previousModel = process.env.TRADING_AGENT_MODEL;
    process.env.TRADING_AGENT_MODEL_PROVIDER = "deepseek";
    process.env.TRADING_AGENT_MODEL = "deepseek-v4-pro";

    try {
      const session = await createHermesTradingSubagentSession("test-hermes-subagent");
      const metadata = buildHermesTradingSubagentMetadata(session);
      const rendered = renderHermesTradingSubagentMetadata(metadata);

      expect(metadata.id).toBe(HERMES_TRADING_SUBAGENT_ID);
      expect(metadata.runtime).toBe("hermes-subagent/pi-agent");
      expect(metadata.modelProvider).toBe("deepseek");
      expect(metadata.modelName).toBe("deepseek-v4-pro");
      expect(metadata.systemPromptSha256).toHaveLength(64);
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("Serenity-style supply-chain chokepoint research");
      expect(metadata.capabilities).toContain("Serenity-style supply-chain chokepoint methodology");
      expect(metadata.capabilities).toContain("Feishu command and natural-language interaction");
      expect(metadata.feishuCommands).toContain("/trading <question>");
      expect(metadata.feishuCommands).toContain("/hermes <question>");
      expect(metadata.toolNames).toContain("screen_a_share_candidates");
      expect(metadata.toolNames).toContain("ffd_route_plan");
      expect(metadata.toolNames).toContain("ffd_industry_signal");
      expect(metadata.toolNames).toContain("ffd_research_search");
      expect(metadata.toolNames).toContain("ffd_news_latest");
      expect(rendered).toContain("System prompt SHA-256");
      expect(rendered).toContain("Feishu commands:");
    } finally {
      if (previousProvider === undefined) delete process.env.TRADING_AGENT_MODEL_PROVIDER;
      else process.env.TRADING_AGENT_MODEL_PROVIDER = previousProvider;
      if (previousModel === undefined) delete process.env.TRADING_AGENT_MODEL;
      else process.env.TRADING_AGENT_MODEL = previousModel;
    }
  });

  it("routes Feishu aliases through the Hermes trading subagent surface", async () => {
    const router = createHermesTradingFeishuRouter({
      shouldRouteDirectlyToFfd: (text) => text.includes("最新价"),
      directFfdQuery: (query) => `FFD:${query}`,
    });

    await expect(router.handleAgentCommand("/trading", "贵州茅台 最新价", "oc_test")).resolves.toBe("FFD:贵州茅台 最新价");
    await expect(router.handleAgentCommand("/reset", "", "oc_test")).resolves.toBe("Hermes trading subagent session reset.");
    await expect(router.handleAgentCommand("/hermes-metadata", "", "oc_test")).resolves.toContain(HERMES_TRADING_SUBAGENT_ID);
    await expect(router.handleAgentCommand("/screen", "", "oc_test")).resolves.toBeUndefined();
  });
});
