import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTradingAgentTools, TRADING_AGENT_SYSTEM_PROMPT } from "../src/agent/trading-agent.js";
import { PORTFOLIO_EXAMPLE, savePortfolio, validatePortfolio } from "../src/portfolio/portfolio.js";

// Position firewall (P0-1): the blind analysis channel must be unable to see holdings
// at the module-graph level. These tests fail the build if anyone wires portfolio data
// into scoring, screening, research, or the agent toolset.

const BLIND_CHANNEL_DIRS = ["src/research", "src/quant", "src/agent", "src/connectors", "src/sources"];
const BLIND_CHANNEL_FILES = ["src/methodology.ts", "src/screener.ts", "src/report.ts"];

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectTsFiles(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("position firewall (module-graph boundary)", () => {
  it("blind-channel modules never import the portfolio module", async () => {
    const files = [...BLIND_CHANNEL_FILES];
    for (const dir of BLIND_CHANNEL_DIRS) {
      files.push(...(await collectTsFiles(dir)));
    }
    const offenders: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      if (/from\s+["'][^"']*portfolio\/portfolio(\.js)?["']/.test(content)) offenders.push(file);
    }
    expect(offenders, `盲评通道模块不得 import 持仓数据：${offenders.join(", ")}`).toEqual([]);
  });

  it("the agent toolset exposes no portfolio/holdings tool", () => {
    const toolNames = createTradingAgentTools().map((tool) => tool.name.toLowerCase());
    expect(toolNames.some((name) => name.includes("portfolio") || name.includes("holding") || name.includes("position"))).toBe(false);
  });

  it("the system prompt declares holdings are not evidence", () => {
    expect(TRADING_AGENT_SYSTEM_PROMPT).toContain("not evidence");
  });
});

describe("portfolio schema and atomic persistence", () => {
  it("accepts the example portfolio", () => {
    const result = validatePortfolio(PORTFOLIO_EXAMPLE);
    expect(result.portfolio).not.toBeNull();
    expect(result.errors).toEqual([]);
  });

  it("rejects malformed codes and overweight portfolios", () => {
    expect(validatePortfolio({ updatedAt: "2026-07-02", positions: [{ code: "abc" }] }).portfolio).toBeNull();
    expect(
      validatePortfolio({
        updatedAt: "2026-07-02",
        positions: [
          { code: "300308", weight: 0.7 },
          { code: "688072", weight: 0.6 },
        ],
      }).errors.join("\n"),
    ).toContain("超过 1");
  });

  it("writes atomically and round-trips through validation", async () => {
    const dir = await fs.mkdtemp(path.join((await import("node:os")).tmpdir(), "portfolio-test-"));
    const filePath = path.join(dir, "portfolio.json");
    await savePortfolio(PORTFOLIO_EXAMPLE, filePath);
    const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    expect(validatePortfolio(raw).portfolio).not.toBeNull();
    const leftovers = (await fs.readdir(dir)).filter((name) => name.includes(".tmp-"));
    expect(leftovers).toEqual([]);
  });

  it("refuses to persist an invalid portfolio", async () => {
    await expect(savePortfolio({ updatedAt: "x", positions: [{ code: "bad" }] } as never, "/tmp/should-not-exist.json")).rejects.toThrow(
      /schema validation/,
    );
  });
});
