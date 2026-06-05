import path from "node:path";
import type { Candidate, ScreenRun } from "./types.js";
import { ensureDir, readJsonFile, writeJsonFile } from "./utils/fs.js";
import fs from "node:fs/promises";
import { summarizeSupplyChainGraph } from "./research/graph.js";

function evidenceMarkdown(candidate: Candidate): string {
  const evidence = candidate.trace.structuredEvidence ?? [];
  if (evidence.length === 0) return "- No structured evidence extracted yet.";
  return evidence
    .slice(0, 5)
    .map(
      (item) =>
        `- ${item.direct ? "Direct" : "Indirect"} ${item.tier}/${item.kind}/${item.polarity} (${item.confidence}) \`${item.sourceId}\`: ${item.snippet}`,
    )
    .join("\n");
}

function graphMarkdown(candidate: Candidate): string {
  if (!candidate.trace.graph) return "No graph generated.";
  return summarizeSupplyChainGraph(candidate.trace.graph)
    .split("\n")
    .map((line) => `- ${line}`)
    .join("\n");
}

function nextActionMarkdown(candidate: Candidate): string {
  const actions = candidate.trace.nextActions ?? [];
  if (actions.length === 0) return "- No next actions generated.";
  return actions.map((action) => `- ${action}`).join("\n");
}

function quantSummaryMarkdown(run: ScreenRun): string {
  const summary = run.quantSummary;
  if (!summary) return "- Quant overlay: not generated.";
  const bucketCounts = Object.entries(summary.bucketCounts)
    .map(([bucket, count]) => `${bucket}=${count}`)
    .join(", ");
  const industries = summary.industryTiers
    .slice(0, 8)
    .map((industry) => `- ${industry.industryKey}: ${industry.score.toFixed(1)} (${industry.tier}, candidates=${industry.candidateCount})`)
    .join("\n");
  return [
    `- Strategy: ${summary.strategy}`,
    `- Risk mode: ${summary.riskMode}`,
    `- Candidate buckets: ${bucketCounts}`,
    `- No crowding penalty: ${summary.noCrowdingPenalty ? "yes" : "no"}`,
    `- Notes: ${summary.notes.join(" ")}`,
    "",
    "Top industry mainline tiers:",
    industries || "- n/a",
  ].join("\n");
}

function industryLogicMarkdown(candidate: Candidate): string {
  const logic = candidate.trace.industryLogic;
  if (!logic) return "- No industry logic assessment generated.";
  return [
    `- Thesis: ${logic.thesis}`,
    `- Trend/Bottleneck/Supply-Elasticity/Validation: ${logic.primaryTrendScore.toFixed(1)}/${logic.bottleneckDepthScore.toFixed(1)}/${logic.supplyDemandProfitScore.toFixed(1)}/${logic.expectationGapScore.toFixed(1)}`,
    `- Validation window: ${logic.validationWindow}`,
    `- Key signals: ${logic.keySignals.length > 0 ? logic.keySignals.join(", ") : "n/a"}`,
    `- Missing signals: ${logic.missingSignals.length > 0 ? logic.missingSignals.join("; ") : "none"}`,
  ].join("\n");
}

function quantMarkdown(candidate: Candidate): string {
  const quant = candidate.quant;
  if (!quant) return "Quant overlay not generated.";
  const components = quant.components
    .map((item) => `- ${item.name}: ${item.score}/${item.maxScore} [${item.kind}] - ${item.reason}`)
    .join("\n");
  const industryComponents = quant.industry.components
    .map((item) => `- ${item.name}: ${item.score}/${item.maxScore} [${item.kind}] - ${item.reason}`)
    .join("\n");
  return `- Quant score: **${quant.stockScore.toFixed(1)}** / Bucket: **${quant.bucket}** / Evidence gate: **${quant.evidenceGate}**
- Industry mainline: **${quant.industry.industryKey} ${quant.industry.score.toFixed(1)} (${quant.industry.tier})**
- No crowding penalty: ${quant.noCrowdingPenalty ? "yes" : "no"}
- Technical confirmation: ${quant.technicalConfirmation.trend} ${quant.technicalConfirmation.volumePrice} ${quant.technicalConfirmation.marketConsensus}

#### Stock Overlay Components

${components}

#### Industry Mainline Components

${industryComponents}

#### Quant Warnings

${quant.warnings.map((warning) => `- ${warning}`).join("\n")}
${quant.excludedReasons.length > 0 ? `\n#### Excluded Reasons\n\n${quant.excludedReasons.map((reason) => `- ${reason}`).join("\n")}` : ""}`;
}

function candidateMarkdown(candidate: Candidate, index: number): string {
  const stock = candidate.stock;
  const sourceIds = new Set(candidate.trace.components.flatMap((component) => component.sourceIds));
  return `## ${index + 1}. ${stock.code} ${stock.name}

- Score: **${candidate.score.toFixed(1)}** / Confidence: **${candidate.confidence}**
- Industry: ${stock.industry || "n/a"} / Concept: ${stock.concept || "n/a"}
- Market cap: ${stock.totalMarketCap == null ? "n/a" : `${(stock.totalMarketCap / 1_000_000_000).toFixed(1)}B CNY`}
- Matched themes: ${candidate.matchedThemes.map((theme) => `${theme.label} (${theme.keywords.join(", ")})`).join("; ")}
- Source IDs: ${[...sourceIds].map((id) => `\`${id}\``).join(", ")}

### Industry Logic & Trend

${industryLogicMarkdown(candidate)}

### Quant Overlay

${quantMarkdown(candidate)}

### Score Trace

${candidate.trace.components.map((component) => `- ${component.name}: ${component.score}/${component.maxScore} - ${component.reason}`).join("\n")}

### Evidence Highlights

${evidenceMarkdown(candidate)}

### Supply Chain Graph

${graphMarkdown(candidate)}

### Risks

${candidate.trace.risks.map((risk) => `- ${risk}`).join("\n")}

### Coverage Gaps

${candidate.trace.coverageGaps.map((gap) => `- ${gap}`).join("\n")}

### Next Research Actions

${nextActionMarkdown(candidate)}
`;
}

export function renderScreenReport(run: ScreenRun): string {
  return `# A股产业瓶颈候选筛选

- Run ID: \`${run.runId}\`
- Generated: ${run.generatedAt}
- Stocks scanned: ${run.totalStocksScanned}
- Sources registered: ${run.sourceCount}

> 本报告是研究候选清单，不构成投资建议或自动交易指令。高置信度需要 P0 主来源和独立交叉验证。

## Serenity Quant Overlay

${quantSummaryMarkdown(run)}

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
    .map((candidate, index) => {
      const quant = candidate.quant ? ` / Q ${candidate.quant.stockScore.toFixed(1)} ${candidate.quant.bucket}` : "";
      return `${index + 1}. ${candidate.stock.code} ${candidate.stock.name} - ${candidate.score.toFixed(1)} (${candidate.confidence})${quant}`;
    })
    .join("\n");
  const quantSummary = run.quantSummary
    ? `Quant: ${run.quantSummary.riskMode}; buckets ${Object.entries(run.quantSummary.bucketCounts)
        .map(([bucket, count]) => `${bucket}=${count}`)
        .join(", ")}; no crowding penalty`
    : "Quant: not generated";
  return `**A股产业瓶颈筛选完成**\n\nRun: ${run.runId}\nScanned: ${run.totalStocksScanned}\n${quantSummary}\n\n${top}\n\nReport: ${run.reportPath ?? "not written"}`;
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
  const industryLogic = industryLogicMarkdown(candidate);
  const evidence = evidenceMarkdown(candidate);
  const graph = graphMarkdown(candidate);
  const risks = trace.risks.map((risk) => `- ${risk}`).join("\n");
  const gaps = trace.coverageGaps.map((gap) => `- ${gap}`).join("\n");
  const actions = nextActionMarkdown(candidate);
  return `# ${candidate.stock.code} ${candidate.stock.name}

- Run: ${run.runId}
- Score: ${candidate.score.toFixed(1)}
- Confidence: ${candidate.confidence}
- Prior: ${trace.priorScore.toFixed(1)}
- Posterior: ${trace.posteriorScore.toFixed(1)}
- Expected value score: ${trace.expectedValueScore.toFixed(1)}

## Components

${components}

## Industry Logic & Trend

${industryLogic}

## Quant Overlay

${quantMarkdown(candidate)}

## Evidence Highlights

${evidence}

## Supply Chain Graph

${graph}

## Risks

${risks}

## Coverage Gaps

${gaps}

## Next Research Actions

${actions}`;
}
