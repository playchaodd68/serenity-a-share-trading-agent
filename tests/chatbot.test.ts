import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createTradingAgent } from "../src/agent/trading-agent.js";
import { extractAssistantText, normalizeChatSessionId, renderChatHelp } from "../src/chatbot/chatbot.js";

describe("chatbot helpers", () => {
  it("extracts assistant text and normalizes session ids", () => {
    const message: AgentMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "internal" },
        { type: "text", text: "候选逻辑" },
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

    expect(extractAssistantText(message)).toBe("候选逻辑");
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
    } finally {
      if (previousProvider === undefined) delete process.env.TRADING_AGENT_MODEL_PROVIDER;
      else process.env.TRADING_AGENT_MODEL_PROVIDER = previousProvider;
      if (previousModel === undefined) delete process.env.TRADING_AGENT_MODEL;
      else process.env.TRADING_AGENT_MODEL = previousModel;
    }
  });
});
