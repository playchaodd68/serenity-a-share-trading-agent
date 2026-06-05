import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createTradingAgent, TRADING_AGENT_SYSTEM_PROMPT } from "../src/agent/trading-agent.js";
import { extractAssistantText, normalizeChatSessionId, renderChatHelp } from "../src/chatbot/chatbot.js";

describe("chatbot helpers", () => {
  it("extracts assistant text and normalizes session ids", () => {
    const message: AgentMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "internal" },
        { type: "text", text: "候選邏輯與產業資訊" },
      ],
      api: "openai-completions",
      provider: "deepseek",
      model: "deepseek-v4-pro",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 0,
    };

    expect(extractAssistantText(message)).toBe("候选逻辑与产业信息");
    expect(normalizeChatSessionId("henry/session")).toBe("henry_session");
    expect(renderChatHelp()).toContain("/metadata");
  });

  it("constructs the trading agent with DeepSeek V4 Pro", () => {
    const previousProvider = process.env.TRADING_AGENT_MODEL_PROVIDER;
    const previousModel = process.env.TRADING_AGENT_MODEL;
    process.env.TRADING_AGENT_MODEL_PROVIDER = "deepseek";
    process.env.TRADING_AGENT_MODEL = "deepseek-v4-pro";

    try {
      const { agent, metadata } = createTradingAgent();
      expect(metadata.modelProvider).toBe("deepseek");
      expect(metadata.modelName).toBe("deepseek-v4-pro");
      expect(agent.state.model.provider).toBe("deepseek");
      expect(agent.state.model.id).toBe("deepseek-v4-pro");
      expect(metadata.toolNames).toContain("check_ffd_connection");
      expect(metadata.toolNames).toContain("query_ffd_data");
      expect(metadata.toolNames).toContain("ffd_health");
      expect(metadata.toolNames).toContain("ffd_query");
      expect(metadata.toolNames).toContain("ffd_route_plan");
      expect(metadata.toolNames).toContain("ffd_intraday_quote");
      expect(metadata.toolNames).toContain("ffd_industry_indicator_data");
      expect(metadata.toolNames).toContain("ffd_announcements");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("do not impersonate Serenity");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("refuse leverage");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("framework extrapolation");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("route FFD data requests deliberately");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("keep Obsidian as the durable RAG ledger");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("never tell the user to paste an FFD API Key");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("Default to Simplified Chinese");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("不要使用繁体字");
      expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("wording has been normalized");
    } finally {
      if (previousProvider === undefined) delete process.env.TRADING_AGENT_MODEL_PROVIDER;
      else process.env.TRADING_AGENT_MODEL_PROVIDER = previousProvider;
      if (previousModel === undefined) delete process.env.TRADING_AGENT_MODEL;
      else process.env.TRADING_AGENT_MODEL = previousModel;
    }
  });
});
