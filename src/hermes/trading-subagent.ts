import crypto from "node:crypto";
import {
  createTradingChatSession,
  promptTradingChatSession,
  saveChatSession,
  type TradingChatCallbacks,
  type TradingChatSession,
  type TradingChatTurnResult,
} from "../chatbot/chatbot.js";
import { TRADING_AGENT_SYSTEM_PROMPT } from "../agent/trading-agent.js";

export const HERMES_TRADING_SUBAGENT_ID = "serenity-a-share-trading";
export const HERMES_TRADING_SUBAGENT_NAME = "Serenity A-share Trading Research";
export const HERMES_TRADING_SUBAGENT_RUNTIME = "hermes-subagent/pi-agent";

export const HERMES_TRADING_SUBAGENT_CAPABILITIES = [
  "Serenity-style supply-chain chokepoint methodology",
  "A-share candidate screening with evidence traces and quant overlay",
  "FFD current market, news, research, money-flow, industry-cycle, announcement, and financial-metric tools",
  "Obsidian RAG/source ledger integration",
  "Feishu command and natural-language interaction",
  "Chinese normalization and high-risk trading-answer safety rules",
] as const;

export const HERMES_TRADING_FEISHU_COMMANDS = [
  "/ask <question>",
  "/chat <question>",
  "/trading <question>",
  "/hermes <question>",
  "/reset",
  "/screen",
  "/research-refresh",
  "/ffd-health",
  "/ffd <query>",
  "/ffd-industry <query>",
  "/ffd-research <keyword>",
  "/ffd-news <keyword>",
  "/ffd-smoke",
  "/ffd-signal <mode> <query>",
  "/ffd-auto-rules",
  "/reports-convert",
  "/reports-enhance [--all|--failed|<report-id>...]",
  "/reports-review",
  "/reports-accept [--force] <report-id>",
  "/reports-accept-quality",
  "/reports-organize-obsidian",
  "/reports-reject <report-id>",
  "/archive-obsidian",
  "/obsidian-init",
  "/watchlist",
  "/calibration",
  "/evals",
  "/quant-adapt-history <options>",
  "/quant-backtest [input-path]",
  "/board <topic-or-mermaid>",
  "/latest",
  "/harness",
  "/why <code-or-name>",
  "/sources",
  "/methodology",
  "/doctor",
] as const;

export interface HermesTradingSubagentMetadata {
  id: string;
  name: string;
  runtime: string;
  modelProvider: string;
  modelName: string;
  base: string;
  toolNames: string[];
  capabilities: readonly string[];
  feishuCommands: readonly string[];
  systemPromptSha256: string;
}

export function buildHermesTradingSubagentMetadata(session: TradingChatSession): HermesTradingSubagentMetadata {
  return {
    id: HERMES_TRADING_SUBAGENT_ID,
    name: HERMES_TRADING_SUBAGENT_NAME,
    runtime: HERMES_TRADING_SUBAGENT_RUNTIME,
    modelProvider: session.metadata.modelProvider,
    modelName: session.metadata.modelName,
    base: session.metadata.base,
    toolNames: [...session.metadata.toolNames],
    capabilities: HERMES_TRADING_SUBAGENT_CAPABILITIES,
    feishuCommands: HERMES_TRADING_FEISHU_COMMANDS,
    systemPromptSha256: crypto.createHash("sha256").update(TRADING_AGENT_SYSTEM_PROMPT).digest("hex"),
  };
}

export async function createHermesTradingSubagentSession(inputSessionId?: string): Promise<TradingChatSession> {
  return createTradingChatSession(inputSessionId);
}

export async function resetHermesTradingSubagentSession(session: TradingChatSession): Promise<void> {
  session.agent.reset();
  await saveChatSession(session);
}

export async function promptHermesTradingSubagent(
  session: TradingChatSession,
  message: string,
  callbacks: TradingChatCallbacks = {},
): Promise<TradingChatTurnResult> {
  return promptTradingChatSession(session, message, callbacks);
}

export function renderHermesTradingSubagentMetadata(metadata: HermesTradingSubagentMetadata): string {
  return [
    `${metadata.name} (${metadata.id})`,
    `Runtime: ${metadata.runtime}`,
    `Model: ${metadata.modelProvider}/${metadata.modelName}`,
    `Base: ${metadata.base}`,
    `System prompt SHA-256: ${metadata.systemPromptSha256}`,
    "",
    "Capabilities:",
    ...metadata.capabilities.map((capability) => `- ${capability}`),
    "",
    `Tools: ${metadata.toolNames.length}`,
    metadata.toolNames.join(", "),
    "",
    "Feishu commands:",
    ...metadata.feishuCommands.map((command) => `- ${command}`),
  ].join("\n");
}
