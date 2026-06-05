import { callFfdTool, classifyFfdToolText, renderFfdToolResultWithStatus, sanitizeFfdText, type FfdAllowedToolName, type FfdResultStatus } from "../connectors/ffd.js";

export interface FfdSmokeProbe {
  id: string;
  label: string;
  toolName: FfdAllowedToolName;
  args: Record<string, unknown>;
  required: boolean;
}

export interface FfdSmokeProbeResult {
  id: string;
  label: string;
  toolName: FfdAllowedToolName;
  required: boolean;
  status: FfdResultStatus | "exception";
  ok: boolean;
  reason?: string;
  preview: string;
}

export interface FfdSmokeRun {
  generatedAt: string;
  ok: boolean;
  results: FfdSmokeProbeResult[];
}

export const FFD_SMOKE_PROBES: FfdSmokeProbe[] = [
  {
    id: "mcp-health",
    label: "MCP health",
    toolName: "ffd_health",
    args: {},
    required: true,
  },
  {
    id: "stock-search",
    label: "Stock code search",
    toolName: "ffd_search_stocks",
    args: { q: "鹏鼎控股", limit: 3 },
    required: true,
  },
  {
    id: "route-plan",
    label: "Capability route plan",
    toolName: "ffd_route_plan",
    args: { query: "半导体行业景气和资金流", format: "markdown" },
    required: true,
  },
  {
    id: "news-search",
    label: "News data plane",
    toolName: "ffd_news_search",
    args: { q: "半导体", format: "markdown" },
    required: true,
  },
  {
    id: "research-search",
    label: "Research-library data plane",
    toolName: "ffd_research_search",
    args: { q: "半导体 存储", format: "markdown" },
    required: true,
  },
  {
    id: "industry-signal",
    label: "Industry-cycle signal",
    toolName: "ffd_industry_signal",
    args: { query: "半导体 存储芯片 行业景气", market: "stock", format: "markdown" },
    required: true,
  },
  {
    id: "money-flow",
    label: "Money-flow data plane",
    toolName: "ffd_money_flow",
    args: { query: "CPO概念今日主力资金净流入", market: "stock", format: "markdown" },
    required: true,
  },
  {
    id: "financial-metrics",
    label: "Financial metrics",
    toolName: "ffd_financial_metrics",
    args: { query: "002938.SZ ROE 营收同比 净利润同比 PE PB", format: "markdown" },
    required: true,
  },
  {
    id: "announcements",
    label: "Announcements",
    toolName: "ffd_announcements",
    args: { codes: "002938.SZ", start_date: "2026-01-01", end_date: "2026-06-03", format: "markdown" },
    required: false,
  },
  {
    id: "quote-history",
    label: "Historical quotes",
    toolName: "ffd_quote_history",
    args: { codes: "002938.SZ", indicators: "收盘价;成交额;涨跌幅", start_date: "2026-05-01", end_date: "2026-06-03", format: "markdown" },
    required: false,
  },
];

function previewText(text: string): string {
  return sanitizeFfdText(text).replace(/\s+/g, " ").trim().slice(0, 260);
}

function isProbeOk(status: FfdSmokeProbeResult["status"]): boolean {
  return status === "ok" || status === "empty_data" || status === "unknown_warning";
}

export async function runFfdSmoke(probes = FFD_SMOKE_PROBES): Promise<FfdSmokeRun> {
  const results: FfdSmokeProbeResult[] = [];
  for (const probe of probes) {
    try {
      const result = await callFfdTool(probe.toolName, probe.args, { timeoutMs: 30_000 });
      const rendered = renderFfdToolResultWithStatus(result);
      const classification = classifyFfdToolText(rendered);
      results.push({
        id: probe.id,
        label: probe.label,
        toolName: probe.toolName,
        required: probe.required,
        status: classification.status,
        ok: isProbeOk(classification.status),
        reason: classification.reason,
        preview: previewText(rendered),
      });
    } catch (error) {
      results.push({
        id: probe.id,
        label: probe.label,
        toolName: probe.toolName,
        required: probe.required,
        status: "exception",
        ok: false,
        reason: error instanceof Error ? sanitizeFfdText(error.message) : sanitizeFfdText(String(error)),
        preview: "",
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    ok: results.every((item) => item.ok || !item.required),
    results,
  };
}

export function renderFfdSmoke(run: FfdSmokeRun): string {
  const counts = run.results.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const keyDisabled = run.results.some((item) => item.status === "api_key_disabled");
  return [
    `FFD data-plane smoke: ${run.ok ? "ok" : "needs attention"}`,
    `Generated: ${run.generatedAt}`,
    `Counts: ${Object.entries(counts).map(([status, count]) => `${status}=${count}`).join(", ")}`,
    keyDisabled ? "Action: FFD API key appears disabled/deleted for data-plane calls. Update local MCP config with `FFD_API_KEY='<new key>' npm run ffd:set-key`, then rerun `npm run ffd:smoke`." : undefined,
    "",
    ...run.results.map((item) => {
      const marker = item.ok ? "✓" : item.required ? "!" : "~";
      const reason = item.reason ? ` | ${item.reason}` : "";
      const preview = item.preview ? `\n  ${item.preview}` : "";
      return `${marker} ${item.id} (${item.toolName}) status=${item.status}${reason}${preview}`;
    }),
  ].filter((line): line is string => line != null).join("\n");
}
