import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ensureDir } from "../utils/fs.js";

// Position firewall (P0-1), data side. Holdings live ONLY here as structured data.
// Contract: nothing under src/research/, src/quant/, src/methodology.ts or
// src/screener.ts may import this module — the blind analysis channel must be unable
// to see positions at the module-graph level (enforced by tests/firewall.test.ts).
// Holdings are consumed exclusively by the read-only position overlay
// (src/pipeline/position-overlay.ts), which may not alter any conclusion.

export const PORTFOLIO_PATH = path.resolve("data/portfolio.json");

const positionSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "A 股代码应为 6 位数字"),
  name: z.string().optional(),
  weight: z.number().min(0).max(1).optional(),
  costBasis: z.number().positive().optional(),
  shares: z.number().positive().optional(),
  note: z.string().optional(),
});

export const PortfolioSchema = z.object({
  updatedAt: z.string(),
  positions: z.array(positionSchema),
});

export type Portfolio = z.infer<typeof PortfolioSchema>;
export type PortfolioPosition = z.infer<typeof positionSchema>;

export function validatePortfolio(input: unknown): { portfolio: Portfolio | null; errors: string[] } {
  const result = PortfolioSchema.safeParse(input);
  if (result.success) {
    const totalWeight = result.data.positions.reduce((sum, position) => sum + (position.weight ?? 0), 0);
    if (totalWeight > 1.0001) {
      return { portfolio: null, errors: [`positions 权重之和 ${totalWeight.toFixed(4)} 超过 1。`] };
    }
    return { portfolio: result.data, errors: [] };
  }
  return { portfolio: null, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}

export async function loadPortfolio(filePath = PORTFOLIO_PATH): Promise<{ portfolio: Portfolio | null; errors: string[] }> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { portfolio: null, errors: [`未找到 ${filePath}；先创建 data/portfolio.json（可参考 data/portfolio.example.json）。`] };
    }
    throw error;
  }
  try {
    return validatePortfolio(JSON.parse(raw));
  } catch {
    return { portfolio: null, errors: ["portfolio.json 不是合法 JSON。"] };
  }
}

// Atomic write: schema-validate first, then temp-file + rename so a crash can never
// leave a half-written holdings file.
export async function savePortfolio(portfolio: Portfolio, filePath = PORTFOLIO_PATH): Promise<void> {
  const checked = validatePortfolio(portfolio);
  if (checked.portfolio == null) {
    throw new Error(`Portfolio failed schema validation: ${checked.errors.join("; ")}`);
  }
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tempPath, `${JSON.stringify(checked.portfolio, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export const PORTFOLIO_EXAMPLE: Portfolio = {
  updatedAt: "2026-07-02T00:00:00.000Z",
  positions: [
    { code: "300308", name: "示例持仓", weight: 0.1, note: "示例条目：复制本文件为 data/portfolio.json 后替换为真实持仓。" },
  ],
};
