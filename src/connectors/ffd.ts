import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { toSimplifiedChinese } from "../utils/chinese.js";

export const FFD_ALLOWED_TOOL_NAMES = [
  "ffd_health",
  "ffd_capabilities",
  "ffd_functions",
  "ffd_route_plan",
  "ffd_nl_query",
  "ffd_search_stocks",
  "ffd_search_indicators",
  "ffd_stock_performance",
  "ffd_quote_history",
  "ffd_intraday_quote",
  "ffd_intraday_snapshot",
  "ffd_technical_indicators",
  "ffd_trading_signal",
  "ffd_support_resistance",
  "ffd_money_flow",
  "ffd_market_intelligence",
  "ffd_industry_stocks",
  "ffd_industry_indicators",
  "ffd_industry_indicator_data",
  "ffd_industry_signal",
  "ffd_industry_overview",
  "ffd_screen_stocks",
  "ffd_macro_data",
  "ffd_financial_metrics",
  "ffd_index_valuation",
  "ffd_announcements",
  "ffd_topic_report",
  "ffd_fund_search",
  "ffd_fund_profile",
  "ffd_fund_market_performance",
  "ffd_fund_nav_history",
  "ffd_fund_portfolio",
  "ffd_fund_ownership",
  "ffd_fund_financials",
  "ffd_fund_company_info",
  "ffd_research_search",
  "ffd_research_detail",
  "ffd_research_download",
  "ffd_news_latest",
  "ffd_news_search",
  "ffd_query",
] as const;

export type FfdAllowedToolName = (typeof FFD_ALLOWED_TOOL_NAMES)[number];

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: {
    serverInfo?: { name?: string; version?: string };
    tools?: Array<{ name?: string; description?: string }>;
    content?: Array<{ type: string; text?: string }>;
  };
  error?: { code?: number; message?: string };
}

export interface FfdCallOptions {
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface FfdToolResult {
  toolName: FfdAllowedToolName;
  text: string;
  json?: unknown;
  serverInfo?: { name?: string; version?: string };
  rawResponse: JsonRpcResponse;
}

export interface FfdHealth {
  status?: string;
  mcp_server_version?: string;
  auto_update?: string;
}

export type FfdResultStatus = "ok" | "api_key_disabled" | "data_error" | "target_not_found" | "empty_data" | "unknown_warning";

export interface FfdResultClassification {
  status: FfdResultStatus;
  reason?: string;
}

export function sanitizeFfdText(value: string): string {
  return toSimplifiedChinese(value.replace(/ffd-[A-Za-z0-9_-]+/g, "[redacted-ffd-key]"));
}

export function defaultFfdCommand(): string {
  return process.env.FFD_MCP_COMMAND ?? path.join(os.homedir(), ".ffd", "run_ffd_mcp.sh");
}

function parseJsonText(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function frameMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "ascii"), body]);
}

function extractText(response: JsonRpcResponse): string {
  return (response.result?.content ?? [])
    .map((item) => (item.type === "text" ? item.text ?? "" : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function classifyFfdToolText(text: string): FfdResultClassification {
  const compact = text.replace(/\s+/g, " ");
  const returnedRows = compact.match(/返回行数[:：]\s*(\d+)/);
  const hasReturnedRows = returnedRows ? Number(returnedRows[1]) > 0 : false;
  if (/API_KEY_DISABLED|API Key.*(停用|删除|无效|过期)|当前 API Key 已停用或已删除|unauthorized|forbidden|invalid api/i.test(compact)) {
    return { status: "api_key_disabled", reason: "FFD API key is disabled, deleted, expired, or unauthorized for this data plane." };
  }
  if (/MCP_TARGET_NOT_FOUND|未能.*识别|请先用 ffd_search_stocks 搜索标的/.test(compact)) {
    return { status: "target_not_found", reason: "FFD could not resolve the requested security, indicator, or announcement target." };
  }
  if (/HISTORY_QUERY_FAILED|QUERY_FAILED|error_code|\"code\"\s*:\s*400|查询失败/.test(compact)) {
    return { status: "data_error", reason: "FFD returned a data query error; check code format, fields, date range, or entitlement." };
  }
  if (!hasReturnedRows && /暂未返回可用数据|返回为空|样本不足|empty/i.test(compact)) {
    return { status: "empty_data", reason: "FFD returned empty or insufficient data for this query." };
  }
  if (/mcp_warnings|注意：|若返回为空|warning/i.test(compact)) {
    return { status: "unknown_warning", reason: "FFD returned warnings; inspect freshness, entitlement, and query route before relying on the result." };
  }
  return { status: "ok" };
}

export function renderFfdToolResultWithStatus(result: FfdToolResult): string {
  const rendered = renderFfdToolResult(result);
  const classification = classifyFfdToolText(rendered);
  if (classification.status === "ok") return rendered;
  return [
    `FFD_RESULT_STATUS: ${classification.status}`,
    classification.reason ? `FFD_RESULT_REASON: ${classification.reason}` : undefined,
    "",
    rendered,
  ].filter((line): line is string => line != null).join("\n");
}

function assertOk(response: JsonRpcResponse, context: string): void {
  if (response.error) {
    throw new Error(sanitizeFfdText(`FFD ${context} failed: ${response.error.message ?? response.error.code ?? "unknown error"}`));
  }
}

export async function callFfdTool(toolName: FfdAllowedToolName, args: Record<string, unknown> = {}, options: FfdCallOptions = {}): Promise<FfdToolResult> {
  const command = options.command ?? defaultFfdCommand();
  const commandArgs = options.args ?? [];
  const timeoutMs = options.timeoutMs ?? 30_000;
  const child = spawn(command, commandArgs, {
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuffer = Buffer.alloc(0);
  let stderr = "";
  const queuedResponses: JsonRpcResponse[] = [];
  const waiters: Array<{ resolve: (response: JsonRpcResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }> = [];

  function resolveResponse(response: JsonRpcResponse): void {
    const waiter = waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(response);
      return;
    }
    queuedResponses.push(response);
  }

  function rejectWaiters(error: Error): void {
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  function pumpFrames(): void {
    while (true) {
      const headerEnd = stdoutBuffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = stdoutBuffer.subarray(0, headerEnd).toString("utf8");
      const lengthLine = header.split(/\r?\n/).find((line) => line.toLowerCase().startsWith("content-length:"));
      if (!lengthLine) throw new Error("FFD MCP response missing Content-Length.");
      const length = Number(lengthLine.split(":", 2)[1]?.trim());
      if (!Number.isFinite(length) || length < 0) throw new Error("FFD MCP response has invalid Content-Length.");
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (stdoutBuffer.byteLength < bodyEnd) return;
      const body = stdoutBuffer.subarray(bodyStart, bodyEnd).toString("utf8");
      stdoutBuffer = stdoutBuffer.subarray(bodyEnd);
      resolveResponse(JSON.parse(body) as JsonRpcResponse);
    }
  }

  function readResponse(context: string): Promise<JsonRpcResponse> {
    const queued = queuedResponses.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = waiters.findIndex((item) => item.resolve === resolve);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(sanitizeFfdText(`FFD ${context} timed out after ${timeoutMs}ms. ${stderr}`.trim())));
      }, timeoutMs);
      waiters.push({ resolve, reject, timer });
    });
  }

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    try {
      pumpFrames();
    } catch (error) {
      rejectWaiters(error instanceof Error ? error : new Error(String(error)));
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  child.on("error", (error) => rejectWaiters(error));
  child.on("exit", (code) => {
    if (waiters.length > 0) {
      rejectWaiters(new Error(sanitizeFfdText(`FFD MCP exited with code ${code ?? "unknown"}. ${stderr}`.trim())));
    }
  });

  let nextId = 1;
  function send(method: string, params?: Record<string, unknown>, includeId = true): void {
    const message: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (includeId) message.id = nextId++;
    if (params) message.params = params;
    child.stdin.write(frameMessage(message));
  }

  try {
    send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "serenity-a-share-trading-agent", version: "1.0.0" },
    });
    const init = await readResponse("initialize");
    assertOk(init, "initialize");

    send("notifications/initialized", undefined, false);
    send("tools/call", { name: toolName, arguments: args });
    const toolResponse = await readResponse(toolName);
    assertOk(toolResponse, toolName);

    const text = sanitizeFfdText(extractText(toolResponse));
    return {
      toolName,
      text,
      json: parseJsonText(text),
      serverInfo: init.result?.serverInfo,
      rawResponse: toolResponse,
    };
  } finally {
    child.stdin.end();
    child.kill();
  }
}

export async function checkFfdHealth(options: FfdCallOptions = {}): Promise<FfdHealth> {
  const result = await callFfdTool("ffd_health", {}, options);
  return (result.json ?? {}) as FfdHealth;
}

export function renderFfdToolResult(result: FfdToolResult): string {
  if (result.text) return toSimplifiedChinese(result.text);
  if (result.json != null) return toSimplifiedChinese(JSON.stringify(result.json, null, 2));
  return toSimplifiedChinese(JSON.stringify(result.rawResponse, null, 2));
}
