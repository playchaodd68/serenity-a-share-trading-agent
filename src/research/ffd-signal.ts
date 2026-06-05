import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, knowledgebasePath } from "../config.js";
import { callFfdTool, classifyFfdToolText, renderFfdToolResultWithStatus, sanitizeFfdText, type FfdAllowedToolName, type FfdResultStatus } from "../connectors/ffd.js";
import { ensureDir, safeFilename } from "../utils/fs.js";
import { toSimplifiedChinese } from "../utils/chinese.js";

export type FfdSignalMode =
  | "nl"
  | "route"
  | "news"
  | "research"
  | "industry"
  | "money"
  | "financial"
  | "announcements"
  | "quotes";

export interface FfdSignalArchiveOptions {
  mode: FfdSignalMode;
  query: string;
  topic?: string;
  generatedAt?: string;
  obsidianRoot?: string;
}

export interface FfdSignalArchiveResult {
  mode: FfdSignalMode;
  toolName: FfdAllowedToolName;
  query: string;
  topic: string;
  generatedAt: string;
  status: FfdResultStatus;
  reason?: string;
  notePath: string;
  text: string;
}

const MODE_TO_TOOL: Record<FfdSignalMode, FfdAllowedToolName> = {
  nl: "ffd_nl_query",
  route: "ffd_route_plan",
  news: "ffd_news_search",
  research: "ffd_research_search",
  industry: "ffd_industry_signal",
  money: "ffd_money_flow",
  financial: "ffd_financial_metrics",
  announcements: "ffd_announcements",
  quotes: "ffd_stock_performance",
};

export const FFD_SIGNAL_MODES = Object.keys(MODE_TO_TOOL) as FfdSignalMode[];

function toolArgsFor(mode: FfdSignalMode, query: string): Record<string, unknown> {
  if (mode === "news" || mode === "research") return { q: query, format: "markdown" };
  if (mode === "industry" || mode === "money") return { query, market: "stock", format: "markdown" };
  return { query, format: "markdown" };
}

function titleFromQuery(mode: FfdSignalMode, query: string, explicit?: string): string {
  if (explicit?.trim()) return toSimplifiedChinese(explicit.trim());
  return toSimplifiedChinese(`${mode}-${query.replace(/\s+/g, " ").slice(0, 48)}`);
}

function renderSignalNote(result: Omit<FfdSignalArchiveResult, "notePath">): string {
  const lines = [
    "---",
    "source_type: ffd_signal",
    `mode: ${result.mode}`,
    `tool: ${result.toolName}`,
    `status: ${result.status}`,
    `generated_at: ${result.generatedAt}`,
    "source_tier: P2",
    "can_use_in_llm: true",
    "can_quote: false",
    "---",
    "",
    `# ${result.topic}`,
    "",
    "## Query",
    "",
    result.query,
    "",
    "## Status",
    "",
    `- FFD status: \`${result.status}\``,
    result.reason ? `- Reason: ${result.reason}` : undefined,
    "- Evidence role: FFD realtime/structured output. Use as market, industry, or coverage-gap signal; do not treat it as candidate-level P0.",
    "",
    "## Result",
    "",
    sanitizeFfdText(result.text),
    "",
    "## Methodology Notes",
    "",
    "- Link this signal to candidate/company/industry notes only when it changes validation windows, evidence gaps, or market fermentation state.",
    "- If status is not `ok`, record it as a data-plane limitation rather than negative industry evidence.",
  ].filter((line): line is string => line != null);
  return `${toSimplifiedChinese(lines.join("\n"))}\n`;
}

export async function archiveFfdSignal(options: FfdSignalArchiveOptions): Promise<FfdSignalArchiveResult> {
  if (!FFD_SIGNAL_MODES.includes(options.mode)) {
    throw new Error(`Unsupported FFD signal mode: ${options.mode}. Use one of: ${FFD_SIGNAL_MODES.join(", ")}`);
  }
  if (!options.query.trim()) {
    throw new Error("FFD signal query is required.");
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const toolName = MODE_TO_TOOL[options.mode];
  const query = toSimplifiedChinese(options.query.trim());
  const topic = titleFromQuery(options.mode, query, options.topic);
  const toolResult = await callFfdTool(toolName, toolArgsFor(options.mode, query), { timeoutMs: 30_000 });
  const text = renderFfdToolResultWithStatus(toolResult);
  const classification = classifyFfdToolText(text);
  const root = options.obsidianRoot ?? knowledgebasePath(getConfig());
  const signalDir = path.join(root, "signals", "ffd");
  await ensureDir(signalDir);
  const date = generatedAt.slice(0, 10);
  const notePath = path.join(signalDir, `${date}-${safeFilename(topic)}.md`);
  const payload = {
    mode: options.mode,
    toolName,
    query,
    topic,
    generatedAt,
    status: classification.status,
    reason: classification.reason,
    text,
  };
  await fs.writeFile(notePath, renderSignalNote(payload), "utf8");
  return { ...payload, notePath };
}

export function renderFfdSignalArchive(result: FfdSignalArchiveResult): string {
  return [
    `Archived FFD signal: ${result.topic}`,
    `Tool: ${result.toolName}`,
    `Status: ${result.status}`,
    result.reason ? `Reason: ${result.reason}` : undefined,
    `Obsidian: ${result.notePath}`,
  ].filter((line): line is string => line != null).join("\n");
}
