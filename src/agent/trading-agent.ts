import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, Type, type Model } from "@earendil-works/pi-ai";
import { getConfig } from "../config.js";
import { callFfdTool, renderFfdToolResultWithStatus, type FfdAllowedToolName } from "../connectors/ffd.js";
import { methodologySummary } from "../methodology.js";
import { loadBearCases } from "../research/debate/bear-case.js";
import { loadGraveyard } from "../research/graveyard.js";
import { screenCandidates } from "../screener.js";
import { loadSourceRegistry } from "../sources/registry.js";

export const TRADING_AGENT_SYSTEM_PROMPT = `You are a personal A-share industry research agent.

Language policy:
- Default to Simplified Chinese (简体中文) for all user-facing answers, including Feishu replies, unless the user explicitly asks for another language.
- Use mainland China financial terminology and punctuation by default.
- 中文回复必须使用简体中文，不要使用繁体字。
- Convert source titles, direct excerpts, FFD/raw tool text, and research-note snippets to Simplified Chinese before user-facing synthesis; if exact wording matters, state that wording has been normalized.

Use Serenity-style supply-chain chokepoint research:
- start from industry structure and bottlenecks, not price action;
- lead with era-level industry trends, capex/profit/production migration, and supply-chain segment ranking before mapping to A-share companies;
- price crowding two-sided: supply-side concentration in a scarce layer (supplier concentration, certification barriers, slow capacity expansion) is chokepoint strength and can score positively on evidence; trading-side crowding (packed pricing, hot attention, high turnover, being front-ran) without new incremental evidence (orders, price, capacity, customer validation) is a negative signal — never merge the two into one "concentration" variable; this restores the source methodology, which itself penalizes crowded/front-ran setups and treats large dilution as a disqualifier;
- drill from downstream demand to next-layer bottlenecks such as chips, materials, connectors, PCB/CCL/copper foil, testing equipment, capacity, yield, and customer certification;
- translate each bottleneck into demand -> supply -> gap -> price -> unit profit -> company elasticity whenever evidence allows;
- distinguish industry correctness from tradeability; state validation windows and invalidation triggers;
- use the Serenity Mainline Quant Overlay when screening candidates: industry logic is the entry gate, while trend, breadth, volume-price confirmation, quality, valuation discipline, liquidity, and financial red-flag checks are auxiliary ranking and risk controls;
- treat governance disqualifiers (立案调查, 财务造假, 退市风险警示, 违规担保, 资金占用, 清仓式减持) as hard vetoes that cap confidence at low — they are not merely score deductions;

Objectivity and anti-sycophancy rules:
- the user's holdings, past opinions, expectations, and emotional state are not evidence; never adjust a conclusion, score, or risk list to match the user's stated position;
- when your evidence-based conclusion conflicts with the user's stated position, present the conflict first and plainly instead of softening or reconciling it;
- every candidate assessment must include a bear case with explicit failure conditions (what evidence would kill the thesis, by when); a recommendation without a bear case is incomplete;
- every theme scan must name at least one popular/hot direction that is deliberately downgraded and explain why (heat is not incremental evidence);
- if price action is driven only by social/P2 attention with no new P0/P1 evidence, flag it as reflexivity risk, not thesis confirmation;
- when the user pushes back without new evidence, restate your conclusion and the evidence gap; do not flip your assessment to agree;
- separate P0 primary evidence, P1 industry/broker evidence, and P2 social/market clues;
- treat accepted FFD broker reports as P1 corroboration only; never let them replace candidate-level P0 filings, announcements, or investor-response evidence for high-confidence conclusions;
- use the local FFD tools for current market, macro, news, research-library, money-flow, and industry-cycle checks when they are relevant;
- route FFD data requests deliberately:
  1. when uncertain, call ffd_route_plan or query_ffd_capabilities before choosing a data tool;
  2. for company/stock tradeability checks, combine ffd_quote_history or ffd_stock_performance with ffd_technical_indicators, ffd_support_resistance, ffd_money_flow, and only use ffd_intraday_quote/ffd_intraday_snapshot for explicit intraday or launch/fermentation questions;
  3. for industry-cycle conclusions, combine ffd_industry_signal with ffd_industry_overview, ffd_industry_indicators, ffd_industry_indicator_data, industry constituents, news, research, and money-flow where relevant;
  4. for candidate validation, use ffd_announcements and ffd_financial_metrics as company-level checks, while treating accepted FFD reports as P1 corroboration;
  5. for macro or valuation context, use ffd_macro_data, ffd_index_valuation, and ffd_topic_report when they directly affect the industry thesis;
- for current price, realtime snapshot, quote, volume, turnover, news, research, money-flow, minute data, technical indicators, announcements, financial metrics, valuation, macro, or industry-cycle questions, call an FFD tool before answering; prefer exact FFD aliases when the request matches them;
- never tell the user to paste an FFD API Key in chat, never print keys in config examples, and never invent FFD installation steps; if FFD health fails, report the local connector status and ask for a local-terminal reinstall only;
- maintain Bayesian-style prior/evidence/posterior traces;
- distinguish direct evidence, multi-source synthesis, framework extrapolation, and unsupported gaps;
- every research answer should expose its evidence trail: source IDs, tier labels, data freshness, direct-vs-corroborating status, and remaining coverage gaps;
- if an FFD tool result starts with FFD_RESULT_STATUS, treat non-ok statuses as evidence limitations: do not infer that there is no news, no money flow, no industry signal, or no financial evidence; state the data-plane failure and route to fallback P0/P1/local evidence where possible;
- keep Obsidian as the durable RAG ledger: accepted sources belong in sources/source-registry.json and source cards; FFD report notes belong in reports/FFD/Accepted; realtime FFD outputs are ephemeral unless converted into a dated signal note with source/tool/date metadata;
- use external Serenity methodology distillations only as research-framework inputs, never as candidate-level primary evidence;
- do not impersonate Serenity or answer in first person as Serenity;
- return candidates, risks, and source coverage gaps, never trading instructions;
- refuse leverage, all-in, borrowing, options-play, or exact allocation guidance and redirect to research risks.
`;

function textResult(details: unknown, text: string) {
  return { content: [{ type: "text" as const, text }], details };
}

const FFD_GENERIC_PARAMETERS = Type.Object({
  query: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  code: Type.Optional(Type.String()),
  codes: Type.Optional(Type.String()),
  indicators: Type.Optional(Type.String()),
  fields: Type.Optional(Type.String()),
  params: Type.Optional(Type.String()),
  market: Type.Optional(Type.String()),
  start_date: Type.Optional(Type.String()),
  end_date: Type.Optional(Type.String()),
  start: Type.Optional(Type.String()),
  end: Type.Optional(Type.String()),
  function: Type.Optional(Type.String()),
  report_id: Type.Optional(Type.String()),
  file_id: Type.Optional(Type.String()),
  format: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
});

function normalizeFfdArgs(params: unknown, defaultArgs: Record<string, unknown> = {}): Record<string, unknown> {
  const incoming = (params ?? {}) as Record<string, unknown>;
  const args: Record<string, unknown> = { ...defaultArgs, ...incoming, format: incoming.format ?? defaultArgs.format ?? "markdown" };
  if (args.code && !args.codes) args.codes = args.code;
  if (args.fields && !args.indicators) args.indicators = args.fields;
  return args;
}

function createFfdPassthroughTool(toolName: FfdAllowedToolName, label: string, description: string, defaultArgs: Record<string, unknown> = {}): AgentTool {
  return {
    name: toolName,
    label,
    description,
    parameters: FFD_GENERIC_PARAMETERS,
    async execute(_toolCallId, params) {
      const result = await callFfdTool(toolName, normalizeFfdArgs(params, defaultArgs));
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };
}

export function createTradingAgentTools(): AgentTool[] {
  const screenTool: AgentTool = {
    name: "screen_a_share_candidates",
    label: "Screen A-share Candidates",
    description: "Screen A-share stocks using the Serenity chokepoint methodology plus the two-sided-crowding quant overlay for trend, breadth, quality, valuation, liquidity, and red-flag checks.",
    parameters: Type.Object({
      maxRows: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
      topN: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    }),
    async execute(_toolCallId, params) {
      const args = params as { maxRows?: number; topN?: number };
      const config = getConfig();
      const sources = await loadSourceRegistry();
      const [bearCases, graveyard] = await Promise.all([loadBearCases(), loadGraveyard()]);
      const run = await screenCandidates(sources, {
        maxRows: args.maxRows ?? config.aShareMaxRows,
        topN: args.topN ?? config.aShareTopN,
        bearCases,
        graveyard,
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

  const ffdHealthTool: AgentTool = {
    name: "check_ffd_connection",
    label: "Check FFD Connection",
    description: "Check whether the local FFD MCP connector is available.",
    parameters: Type.Object({}),
    async execute() {
      const result = await callFfdTool("ffd_health", {});
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdCapabilitiesTool: AgentTool = {
    name: "query_ffd_capabilities",
    label: "FFD Capabilities",
    description: "Return the current FFD capability map. Use this before uncertain FFD routing.",
    parameters: Type.Object({
      query: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query?: string };
      const result = await callFfdTool("ffd_capabilities", { query: args.query ?? "", format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdNlTool: AgentTool = {
    name: "query_ffd_data",
    label: "Query FFD Data",
    description: "Use FFD natural-language routing for current quotes, macro data, financial metrics, screening, announcements, industry overviews, news, and research searches.",
    parameters: Type.Object({
      query: Type.String(),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query: string };
      const result = await callFfdTool("ffd_nl_query", { query: args.query, format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdIndustrySignalTool: AgentTool = {
    name: "query_ffd_industry_signal",
    label: "FFD Industry Signal",
    description: "Use FFD to analyze industry cycle signals from indicators, news clues, and research-library clues.",
    parameters: Type.Object({
      query: Type.String(),
      market: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query: string; market?: string };
      const result = await callFfdTool("ffd_industry_signal", { query: args.query, market: args.market ?? "stock", format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdMarketIntelligenceTool: AgentTool = {
    name: "query_ffd_market_intelligence",
    label: "FFD Market Intelligence",
    description: "Use FFD for composite checks that combine money flow, news sentiment, research clues, catalysts, or sector review.",
    parameters: Type.Object({
      query: Type.String(),
      market: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query: string; market?: string };
      const result = await callFfdTool("ffd_market_intelligence", { query: args.query, market: args.market ?? "stock", format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdResearchTool: AgentTool = {
    name: "search_ffd_research",
    label: "Search FFD Research",
    description: "Search the FFD research library for broker or industry reports. Do not download reports unless explicitly requested.",
    parameters: Type.Object({
      query: Type.String(),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query: string };
      const result = await callFfdTool("ffd_research_search", { q: args.query, format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdNewsTool: AgentTool = {
    name: "search_ffd_news",
    label: "Search FFD News",
    description: "Search FFD's global news pool for keyword-based market or industry clues.",
    parameters: Type.Object({
      query: Type.String(),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query: string };
      const result = await callFfdTool("ffd_news_search", { q: args.query, format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdHealthAliasTool: AgentTool = {
    name: "ffd_health",
    label: "FFD Health",
    description: "Native FFD alias. Check the local FFD MCP health status.",
    parameters: Type.Object({}),
    async execute() {
      const result = await callFfdTool("ffd_health", {});
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdNlAliasTool: AgentTool = {
    name: "ffd_nl_query",
    label: "FFD Natural Query",
    description: "Native FFD alias. Route a natural-language finance data question through FFD.",
    parameters: Type.Object({
      query: Type.String(),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query: string };
      const result = await callFfdTool("ffd_nl_query", { query: args.query, format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdQueryAliasTool: AgentTool = {
    name: "ffd_query",
    label: "FFD Query",
    description: "Native FFD alias. General FFD public data query, including realtime_quote with codes and indicators.",
    parameters: Type.Object({
      function: Type.Optional(Type.String()),
      codes: Type.Optional(Type.String()),
      indicators: Type.Optional(Type.String()),
      query: Type.Optional(Type.String()),
      start: Type.Optional(Type.String()),
      end: Type.Optional(Type.String()),
      adjust: Type.Optional(Type.String()),
      format: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const args = params as Record<string, unknown>;
      const result = await callFfdTool("ffd_query", { format: "markdown", ...args });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdSearchStocksAliasTool: AgentTool = {
    name: "ffd_search_stocks",
    label: "FFD Search Stocks",
    description: "Native FFD alias. Search standard stock codes by Chinese name, ticker, or pinyin.",
    parameters: Type.Object({
      q: Type.String(),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    }),
    async execute(_toolCallId, params) {
      const args = params as { q: string; limit?: number };
      const result = await callFfdTool("ffd_search_stocks", { q: args.q, limit: args.limit ?? 10 });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdIndustrySignalAliasTool: AgentTool = {
    name: "ffd_industry_signal",
    label: "FFD Industry Signal",
    description: "Native FFD alias. Analyze industry-cycle signals from FFD data.",
    parameters: Type.Object({
      query: Type.String(),
      market: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query: string; market?: string };
      const result = await callFfdTool("ffd_industry_signal", { query: args.query, market: args.market ?? "stock", format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdMarketIntelligenceAliasTool: AgentTool = {
    name: "ffd_market_intelligence",
    label: "FFD Market Intelligence",
    description: "Native FFD alias. Combine money flow, news sentiment, research clues, catalysts, and sector review.",
    parameters: Type.Object({
      query: Type.String(),
      market: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const args = params as { query: string; market?: string };
      const result = await callFfdTool("ffd_market_intelligence", { query: args.query, market: args.market ?? "stock", format: "markdown" });
      return textResult(result, renderFfdToolResultWithStatus(result));
    },
  };

  const ffdRoutePlanAliasTool = createFfdPassthroughTool(
    "ffd_route_plan",
    "FFD Route Plan",
    "Native FFD alias. Ask FFD which data tool, parameters, and fallback route should be used for a finance data question.",
  );
  const ffdFunctionsAliasTool = createFfdPassthroughTool(
    "ffd_functions",
    "FFD Functions",
    "Native FFD alias. Inspect public FFD function names, parameters, and examples before using lower-level data calls.",
  );
  const ffdSearchIndicatorsAliasTool = createFfdPassthroughTool(
    "ffd_search_indicators",
    "FFD Search Indicators",
    "Native FFD alias. Search public indicator fields before date_series/basic_data or industry indicator calls.",
  );
  const ffdQuoteHistoryAliasTool = createFfdPassthroughTool(
    "ffd_quote_history",
    "FFD Quote History",
    "Native FFD alias. Retrieve historical daily price, volume, amount, turnover, and pct-change data for stock or index backchecks.",
  );
  const ffdStockPerformanceAliasTool = createFfdPassthroughTool(
    "ffd_stock_performance",
    "FFD Stock Performance",
    "Native FFD alias. Summarize stock or index performance over a requested window.",
  );
  const ffdIntradayQuoteAliasTool = createFfdPassthroughTool(
    "ffd_intraday_quote",
    "FFD Intraday Quote",
    "Native FFD alias. Retrieve minute-level intraday bars for explicit intraday, launch, or fermentation checks.",
  );
  const ffdIntradaySnapshotAliasTool = createFfdPassthroughTool(
    "ffd_intraday_snapshot",
    "FFD Intraday Snapshot",
    "Native FFD alias. Retrieve intraday snapshots for explicit same-day market-reaction checks.",
  );
  const ffdTechnicalIndicatorsAliasTool = createFfdPassthroughTool(
    "ffd_technical_indicators",
    "FFD Technical Indicators",
    "Native FFD alias. Retrieve RSI, MACD, moving averages, Bollinger Bands, ATR, or OBV as secondary tradeability context.",
  );
  const ffdTradingSignalAliasTool = createFfdPassthroughTool(
    "ffd_trading_signal",
    "FFD Trading Signal",
    "Native FFD alias. Generate a bullish/bearish/neutral technical signal for context only, never as standalone investment advice.",
  );
  const ffdSupportResistanceAliasTool = createFfdPassthroughTool(
    "ffd_support_resistance",
    "FFD Support Resistance",
    "Native FFD alias. Estimate support and resistance levels from historical highs and lows for market-fermentation checks.",
  );
  const ffdMoneyFlowAliasTool = createFfdPassthroughTool(
    "ffd_money_flow",
    "FFD Money Flow",
    "Native FFD alias. Query stock, sector, concept, northbound, main-fund, or chip-distribution money-flow clues.",
  );
  const ffdScreenStocksAliasTool = createFfdPassthroughTool(
    "ffd_screen_stocks",
    "FFD Screen Stocks",
    "Native FFD alias. Screen stocks by concept, sector, financial, market, or money-flow conditions.",
    { market: "stock" },
  );
  const ffdIndustryStocksAliasTool = createFfdPassthroughTool(
    "ffd_industry_stocks",
    "FFD Industry Stocks",
    "Native FFD alias. Retrieve industry or concept constituents before mapping bottlenecks to A-share companies.",
  );
  const ffdIndustryIndicatorsAliasTool = createFfdPassthroughTool(
    "ffd_industry_indicators",
    "FFD Industry Indicators",
    "Native FFD alias. Search industry-cycle indicators relevant to a bottleneck thesis.",
  );
  const ffdIndustryIndicatorDataAliasTool = createFfdPassthroughTool(
    "ffd_industry_indicator_data",
    "FFD Industry Indicator Data",
    "Native FFD alias. Retrieve industry economic indicator series for cycle and prosperity validation.",
  );
  const ffdIndustryOverviewAliasTool = createFfdPassthroughTool(
    "ffd_industry_overview",
    "FFD Industry Overview",
    "Native FFD alias. Combine industry indicators, constituents, news, and research for a sector overview.",
    { market: "stock" },
  );
  const ffdMacroDataAliasTool = createFfdPassthroughTool(
    "ffd_macro_data",
    "FFD Macro Data",
    "Native FFD alias. Retrieve macro series such as GDP, CPI, PPI, PMI, M2, social financing, DR007, imports/exports, or treasury-futures data.",
  );
  const ffdFinancialMetricsAliasTool = createFfdPassthroughTool(
    "ffd_financial_metrics",
    "FFD Financial Metrics",
    "Native FFD alias. Retrieve company-level ROE, profit growth, revenue growth, PE/PB, and related financial metrics.",
  );
  const ffdIndexValuationAliasTool = createFfdPassthroughTool(
    "ffd_index_valuation",
    "FFD Index Valuation",
    "Native FFD alias. Retrieve index PE/PB and valuation percentile context.",
  );
  const ffdAnnouncementsAliasTool = createFfdPassthroughTool(
    "ffd_announcements",
    "FFD Announcements",
    "Native FFD alias. Query listed-company announcements for candidate-level validation.",
  );
  const ffdTopicReportAliasTool = createFfdPassthroughTool(
    "ffd_topic_report",
    "FFD Topic Report",
    "Native FFD alias. Retrieve structured topical reports when the report id and parameters are known.",
  );
  const ffdResearchSearchAliasTool = createFfdPassthroughTool(
    "ffd_research_search",
    "FFD Research Search",
    "Native FFD alias. Search the FFD research library for broker or industry reports.",
  );
  const ffdResearchDetailAliasTool = createFfdPassthroughTool(
    "ffd_research_detail",
    "FFD Research Detail",
    "Native FFD alias. Retrieve detail metadata for a specific research-library result.",
  );
  const ffdResearchDownloadAliasTool = createFfdPassthroughTool(
    "ffd_research_download",
    "FFD Research Download",
    "Native FFD alias. Download a licensed research report only when the user explicitly asks for download or archiving.",
  );
  const ffdNewsSearchAliasTool = createFfdPassthroughTool(
    "ffd_news_search",
    "FFD News Search",
    "Native FFD alias. Search FFD's global news pool for keyword-based market or industry clues.",
  );
  const ffdNewsLatestAliasTool = createFfdPassthroughTool(
    "ffd_news_latest",
    "FFD Latest News",
    "Native FFD alias. Retrieve latest global news-pool items for current catalyst checks.",
  );

  return [
    screenTool,
    methodologyTool,
    sourcesTool,
    ffdHealthTool,
    ffdCapabilitiesTool,
    ffdNlTool,
    ffdIndustrySignalTool,
    ffdMarketIntelligenceTool,
    ffdResearchTool,
    ffdNewsTool,
    ffdHealthAliasTool,
    ffdNlAliasTool,
    ffdQueryAliasTool,
    ffdSearchStocksAliasTool,
    ffdSearchIndicatorsAliasTool,
    ffdRoutePlanAliasTool,
    ffdFunctionsAliasTool,
    ffdQuoteHistoryAliasTool,
    ffdStockPerformanceAliasTool,
    ffdIntradayQuoteAliasTool,
    ffdIntradaySnapshotAliasTool,
    ffdTechnicalIndicatorsAliasTool,
    ffdTradingSignalAliasTool,
    ffdSupportResistanceAliasTool,
    ffdMoneyFlowAliasTool,
    ffdScreenStocksAliasTool,
    ffdIndustrySignalAliasTool,
    ffdIndustryStocksAliasTool,
    ffdIndustryIndicatorsAliasTool,
    ffdIndustryIndicatorDataAliasTool,
    ffdIndustryOverviewAliasTool,
    ffdMarketIntelligenceAliasTool,
    ffdMacroDataAliasTool,
    ffdFinancialMetricsAliasTool,
    ffdIndexValuationAliasTool,
    ffdAnnouncementsAliasTool,
    ffdTopicReportAliasTool,
    ffdResearchSearchAliasTool,
    ffdResearchDetailAliasTool,
    ffdResearchDownloadAliasTool,
    ffdNewsSearchAliasTool,
    ffdNewsLatestAliasTool,
  ];
}

export function createTradingAgent() {
  const config = getConfig();
  const tools = createTradingAgentTools();
  const model = getModel(config.modelProvider as any, config.modelName as any) as Model<any> | undefined;
  if (!model) {
    throw new Error(`Unknown model: ${config.modelProvider}/${config.modelName}. Check TRADING_AGENT_MODEL_PROVIDER and TRADING_AGENT_MODEL.`);
  }
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
