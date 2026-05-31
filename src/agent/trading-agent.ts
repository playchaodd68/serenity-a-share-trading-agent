import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, Type } from "@earendil-works/pi-ai";
import { getConfig } from "../config.js";
import { methodologySummary } from "../methodology.js";
import { initializeKnowledgebase } from "../rag/obsidian.js";
import { screenCandidates } from "../screener.js";
import { loadSourceRegistry } from "../sources/registry.js";

export const TRADING_AGENT_SYSTEM_PROMPT = `You are a personal A-share industry research agent.

Use Serenity-style supply-chain chokepoint research:
- start from industry structure and bottlenecks, not price action;
- separate P0 primary evidence, P1 industry/broker evidence, and P2 social/market clues;
- maintain Bayesian-style prior/evidence/posterior traces;
- return candidates, risks, and source coverage gaps, never trading instructions.
`;

function textResult(details: unknown, text: string) {
  return { content: [{ type: "text" as const, text }], details };
}

export function createTradingAgentTools(): AgentTool[] {
  const screenTool: AgentTool = {
    name: "screen_a_share_candidates",
    label: "Screen A-share Candidates",
    description: "Screen A-share stocks using the Serenity chokepoint methodology.",
    parameters: Type.Object({
      maxRows: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
      topN: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    }),
    async execute(_toolCallId, params) {
      const args = params as { maxRows?: number; topN?: number };
      const config = getConfig();
      const sources = await loadSourceRegistry();
      const run = await screenCandidates(sources, {
        maxRows: args.maxRows ?? config.aShareMaxRows,
        topN: args.topN ?? config.aShareTopN,
      });
      return textResult(run, JSON.stringify(run.candidates.slice(0, 5), null, 2));
    },
  };

  const methodologyTool: AgentTool = {
    name: "explain_serenity_methodology",
    label: "Explain Methodology",
    description: "Return the canonical Serenity-derived methodology note.",
    parameters: Type.Object({}),
    async execute() {
      const text = methodologySummary();
      return textResult({ methodology: text }, text);
    },
  };

  const sourcesTool: AgentTool = {
    name: "list_registered_sources",
    label: "List Sources",
    description: "List registered source records and tiers.",
    parameters: Type.Object({}),
    async execute() {
      const sources = await loadSourceRegistry();
      return textResult(
        { sources },
        sources.map((source) => `${source.id} [${source.tier}] ${source.title}`).join("\n"),
      );
    },
  };

  const obsidianTool: AgentTool = {
    name: "init_obsidian_knowledgebase",
    label: "Initialize Obsidian KB",
    description: "Create or refresh the Obsidian RAG knowledgebase folder.",
    parameters: Type.Object({}),
    async execute() {
      const sources = await loadSourceRegistry();
      const result = await initializeKnowledgebase(sources);
      return textResult(result, `Initialized knowledgebase at ${result.root}`);
    },
  };

  return [screenTool, methodologyTool, sourcesTool, obsidianTool];
}

export function createTradingAgent() {
  const config = getConfig();
  const tools = createTradingAgentTools();
  const model = getModel(config.modelProvider as any, config.modelName as any);
  const agent = new Agent({
    initialState: {
      systemPrompt: TRADING_AGENT_SYSTEM_PROMPT,
      model,
      tools,
      thinkingLevel: "medium",
    },
  });
  return {
    agent,
    metadata: {
      modelProvider: config.modelProvider,
      modelName: config.modelName,
      toolNames: tools.map((tool) => tool.name),
      base: "earendil-works/pi @earendil-works/pi-agent-core 0.78.0",
    },
  };
}
