import path from "node:path";
import type { Candidate, ScreenRun } from "./types.js";
import { ensureDir, readJsonFile, writeJsonFile } from "./utils/fs.js";
import fs from "node:fs/promises";

function candidateMarkdown(candidate: Candidate, index: number): string {
  const stock = candidate.stock;
  const sourceIds = new Set(candidate.trace.components.flatMap((component) => component.sourceIds));
  return `## ${index + 1}. ${stock.code} ${stock.name}

- Score: **${candidate.score.toFixed(1)}** / Confidence: **${candidate.confidence}**
- Industry: ${stock.industry || "n/a"} / Concept: ${stock.concept || "n/a"}
- Market cap: ${stock.totalMarketCap == null ? "n/a" : `${(stock.totalMarketCap / 1_000_000_000).toFixed(1)}B CNY`}
- Matched themes: ${candidate.matchedThemes.map((theme) => `${theme.label} (${theme.keywords.join(", ")})`).join("; ")}
- Source IDs: ${[...sourceIds].map((id) => `\`${id}\``).join(", ")}

### Score Trace

${candidate.trace.components.map((component) => `- ${component.name}: ${component.score}/${component.maxScore} - ${component.reason}`).join("\n")}

### Risks

${candidate.trace.risks.map((risk) => `- ${risk}`).join("\n")}

### Coverage Gaps

${candidate.trace.coverageGaps.map((gap) => `- ${gap}`).join("\n")}
`;
}

export function renderScreenReport(run: ScreenRun): string {
  return `# A股产业瓶颈候选筛选

- Run ID: \`${run.runId}\`
- Generated: ${run.generatedAt}
- Stocks scanned: ${run.totalStocksScanned}
- Sources registered: ${run.sourceCount}

> 本报告是研究候选清单，不构成投资建议或自动交易指令。高置信度需要 P0 主来源和独立交叉验证。

${run.candidates.map(candidateMarkdown).join("\n")}
`;
}

export async function writeScreenReport(run: ScreenRun, outputDir = "reports"): Promise<ScreenRun> {
  await ensureDir(outputDir);
  const mdPath = path.resolve(outputDir, `${run.runId}.md`);
  const jsonPath = path.resolve(outputDir, `${run.runId}.json`);
  const completed = { ...run, reportPath: mdPath, jsonPath };
  await fs.writeFile(mdPath, renderScreenReport(completed), "utf8");
  await writeJsonFile(jsonPath, completed);
  return completed;
}

export function renderFeishuSummary(run: ScreenRun): string {
  const top = run.candidates
    .slice(0, 8)
    .map((candidate, index) => `${index + 1}. ${candidate.stock.code} ${candidate.stock.name} - ${candidate.score.toFixed(1)} (${candidate.confidence})`)
    .join("\n");
  return `**A股产业瓶颈筛选完成**\n\nRun: ${run.runId}\nScanned: ${run.totalStocksScanned}\n\n${top}\n\nReport: ${run.reportPath ?? "not written"}`;
}

export async function findLatestRun(outputDir = "reports"): Promise<ScreenRun | null> {
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("screen-") && entry.name.endsWith(".json"))
      .map((entry) => path.join(outputDir, entry.name))
      .sort()
      .reverse();
    for (const file of jsonFiles) {
      const run = await readJsonFile<ScreenRun | null>(file, null);
      if (run?.runId) return run;
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function explainCandidate(run: ScreenRun, codeOrName: string): string {
  const query = codeOrName.trim().toLowerCase();
  const candidate = run.candidates.find((item) => item.stock.code.toLowerCase() === query || item.stock.name.toLowerCase().includes(query));
  if (!candidate) return `No candidate matched "${codeOrName}" in run ${run.runId}.`;

  const trace = candidate.trace;
  const components = trace.components.map((item) => `- ${item.name}: ${item.score}/${item.maxScore} - ${item.reason}`).join("\n");
  const risks = trace.risks.map((risk) => `- ${risk}`).join("\n");
  const gaps = trace.coverageGaps.map((gap) => `- ${gap}`).join("\n");
  return `# ${candidate.stock.code} ${candidate.stock.name}

- Run: ${run.runId}
- Score: ${candidate.score.toFixed(1)}
- Confidence: ${candidate.confidence}
- Prior: ${trace.priorScore.toFixed(1)}
- Posterior: ${trace.posteriorScore.toFixed(1)}
- Expected value score: ${trace.expectedValueScore.toFixed(1)}

## Components

${components}

## Risks

${risks}

## Coverage Gaps

${gaps}`;
}
