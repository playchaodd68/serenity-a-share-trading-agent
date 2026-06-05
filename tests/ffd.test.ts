import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FFD_ALLOWED_TOOL_NAMES, callFfdTool, classifyFfdToolText, renderFfdToolResultWithStatus, sanitizeFfdText } from "../src/connectors/ffd.js";

async function writeMockFfdServer(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ffd-mcp-mock-"));
  const filePath = path.join(dir, "mock-ffd-server.mjs");
  await fs.writeFile(
    filePath,
    `
let buffer = Buffer.alloc(0);

function frame(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n", "ascii"), body]);
}

function respond(request) {
  if (request.method === "initialize") {
    process.stdout.write(frame({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ffd-mcp", version: "0.6.4" }
      }
    }));
    return;
  }
  if (request.method === "notifications/initialized") return;
  if (request.method === "tools/call" && request.params?.name === "ffd_health") {
    process.stdout.write(frame({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: JSON.stringify({ status: "ok", mcp_server_version: "0.6.4", auto_update: "enabled" }, null, 2) }]
      }
    }));
    return;
  }
  process.stdout.write(frame({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "not found" } }));
}

function pump() {
  while (true) {
    const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const line = header.split(/\\r?\\n/).find((item) => item.toLowerCase().startsWith("content-length:"));
    const length = Number(line.split(":", 2)[1].trim());
    const start = headerEnd + 4;
    const end = start + length;
    if (buffer.byteLength < end) return;
    const request = JSON.parse(buffer.subarray(start, end).toString("utf8"));
    buffer = buffer.subarray(end);
    respond(request);
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  pump();
});
`,
    "utf8",
  );
  return filePath;
}

describe("FFD MCP connector", () => {
  it("calls a local MCP tool and parses JSON text results", async () => {
    const mockServer = await writeMockFfdServer();

    const result = await callFfdTool("ffd_health", {}, { command: process.execPath, args: [mockServer], timeoutMs: 5_000 });

    expect(result.serverInfo).toEqual({ name: "ffd-mcp", version: "0.6.4" });
    expect(result.json).toMatchObject({ status: "ok", mcp_server_version: "0.6.4" });
  });

  it("redacts FFD keys from connector text", () => {
    const sample = ["bad", ["ffd", "if", "secret123"].join("-"), "token"].join(" ");
    expect(sanitizeFfdText(sample)).toContain("[redacted-ffd-key]");
  });

  it("normalizes rendered FFD tool text to Simplified Chinese", () => {
    const rendered = renderFfdToolResultWithStatus({
      toolName: "ffd_industry_signal",
      text: "產業邏輯與資金發酵，臺灣軟體資訊後續驗證。",
      rawResponse: { jsonrpc: "2.0", result: { content: [] } },
    });

    expect(rendered).toContain("产业逻辑与资金发酵，台湾软件信息后续验证。");
    expect(rendered).not.toContain("產業");
  });

  it("allows the FFD realtime, routing, industry, and research tools used by the trading agent", () => {
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_route_plan");
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_intraday_quote");
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_intraday_snapshot");
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_technical_indicators");
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_money_flow");
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_industry_indicator_data");
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_announcements");
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_research_detail");
    expect(FFD_ALLOWED_TOOL_NAMES).toContain("ffd_news_latest");
  });

  it("classifies FFD data-plane warnings before agent synthesis", () => {
    const disabled = '{ "code": 401, "error_code": "API_KEY_DISABLED", "message": "当前 API Key 已停用或已删除，请在面板创建新的 Key 后重试" }';
    expect(classifyFfdToolText(disabled).status).toBe("api_key_disabled");
    expect(classifyFfdToolText('{ "error_code": "MCP_TARGET_NOT_FOUND", "message": "未能识别公告查询标的" }').status).toBe("target_not_found");
    expect(classifyFfdToolText('{ "error_code": "HISTORY_QUERY_FAILED", "message": "历史行情暂未返回可用数据" }').status).toBe("data_error");
    expect(classifyFfdToolText("若返回为空，请补充条件。摘要：- 数据状态：实时；返回行数：98").status).toBe("unknown_warning");

    const rendered = renderFfdToolResultWithStatus({
      toolName: "ffd_news_search",
      text: disabled,
      rawResponse: { jsonrpc: "2.0", result: { content: [{ type: "text", text: disabled }] } },
    });
    expect(rendered).toContain("FFD_RESULT_STATUS: api_key_disabled");
    expect(rendered).toContain("FFD_RESULT_REASON:");
  });
});
