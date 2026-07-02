import path from "node:path";
import { readJsonFile } from "../utils/fs.js";
import type { HybridSearchOutput } from "./library-hybrid.js";

// P1-3: golden retrieval eval. RAG changes without a fixed measurement set devolve into
// vibes; every retrieval-layer change must run this before/after. Matching is at the
// REPORT level (any relevant sourceRecordId appearing in the ranked report order).

export const LIBRARY_EVAL_PATH = path.resolve("evals/library-retrieval.json");

export interface RetrievalEvalCase {
  id: string;
  query: string;
  relevant: string[];
}

export interface RetrievalEvalFile {
  version: number;
  note?: string;
  cases: RetrievalEvalCase[];
}

export interface RetrievalCaseResult {
  id: string;
  query: string;
  rank: number | null; // 1-based rank of the first relevant REPORT
  hitAt5: boolean;
  hitAt10: boolean;
  topSource?: string;
}

export interface RetrievalEvalSummary {
  mode: string;
  caseCount: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  perCase: RetrievalCaseResult[];
}

export async function loadRetrievalEvalCases(filePath = LIBRARY_EVAL_PATH): Promise<RetrievalEvalCase[]> {
  const file = await readJsonFile<RetrievalEvalFile | null>(filePath, null);
  if (!file || !Array.isArray(file.cases) || file.cases.length === 0) {
    throw new Error(`未找到检索评测集：${filePath}`);
  }
  return file.cases;
}

// Collapse a chunk-level result list into report order (first appearance wins).
export function reportOrderFromResults(results: HybridSearchOutput["results"]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const result of results) {
    const key = result.document.sourceRecordId;
    if (seen.has(key)) continue;
    seen.add(key);
    order.push(key);
  }
  return order;
}

export function scoreRetrievalCase(evalCase: RetrievalEvalCase, reportOrder: string[]): RetrievalCaseResult {
  const relevant = new Set(evalCase.relevant);
  let rank: number | null = null;
  for (let index = 0; index < reportOrder.length; index += 1) {
    if (relevant.has(reportOrder[index])) {
      rank = index + 1;
      break;
    }
  }
  return {
    id: evalCase.id,
    query: evalCase.query,
    rank,
    hitAt5: rank != null && rank <= 5,
    hitAt10: rank != null && rank <= 10,
    topSource: reportOrder[0],
  };
}

export async function runRetrievalEval(
  cases: RetrievalEvalCase[],
  search: (query: string) => Promise<HybridSearchOutput>,
  modeLabel: string,
): Promise<RetrievalEvalSummary> {
  const perCase: RetrievalCaseResult[] = [];
  for (const evalCase of cases) {
    const output = await search(evalCase.query);
    perCase.push(scoreRetrievalCase(evalCase, reportOrderFromResults(output.results)));
  }
  const count = perCase.length;
  return {
    mode: modeLabel,
    caseCount: count,
    recallAt5: Number((perCase.filter((item) => item.hitAt5).length / count).toFixed(4)),
    recallAt10: Number((perCase.filter((item) => item.hitAt10).length / count).toFixed(4)),
    mrr: Number((perCase.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / count).toFixed(4)),
    perCase,
  };
}

export function renderRetrievalEval(summaries: RetrievalEvalSummary[]): string {
  const lines: string[] = ["# 研报库检索评测(recall@k / MRR,报告级命中)"];
  for (const summary of summaries) {
    lines.push(
      "",
      `## 模式:${summary.mode}(${summary.caseCount} 条金标)`,
      `- recall@5 = ${(summary.recallAt5 * 100).toFixed(1)}%  |  recall@10 = ${(summary.recallAt10 * 100).toFixed(1)}%  |  MRR = ${summary.mrr}`,
      `- 未命中(rank=null 或 >10):${summary.perCase.filter((item) => !item.hitAt10).map((item) => item.id).join("、") || "无"}`,
    );
  }
  if (summaries.length === 2) {
    const [a, b] = summaries;
    lines.push(
      "",
      `## 对比:${b.mode} vs ${a.mode}`,
      `- recall@5:${(a.recallAt5 * 100).toFixed(1)}% → ${(b.recallAt5 * 100).toFixed(1)}%;MRR:${a.mrr} → ${b.mrr}`,
    );
  }
  return lines.join("\n");
}
