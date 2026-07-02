import { describe, expect, it } from "vitest";
import {
  renderRetrievalEval,
  reportOrderFromResults,
  runRetrievalEval,
  scoreRetrievalCase,
  type RetrievalEvalCase,
} from "../src/research/library-eval.js";
import type { HybridSearchOutput } from "../src/research/library-hybrid.js";
import type { LibrarySearchResult } from "../src/research/library-search.js";

function result(sourceRecordId: string, chunkId = "chunk-1"): LibrarySearchResult {
  return {
    score: 1,
    document: {
      reportId: sourceRecordId.replace("P1-", ""),
      sourceRecordId,
      chunkId,
      title: sourceRecordId,
      status: "accepted",
      text: "内容",
      topics: [],
      companies: [],
      sourceTier: "P1",
      requiresP0Verification: true,
      tokenEstimate: 100,
    },
  };
}

function output(ids: string[]): HybridSearchOutput {
  return { mode: "hybrid", reportCount: ids.length, results: ids.map((id) => result(id)) };
}

const CASES: RetrievalEvalCase[] = [
  { id: "hit-first", query: "q1", relevant: ["P1-A"] },
  { id: "hit-rank3", query: "q2", relevant: ["P1-C"] },
  { id: "miss", query: "q3", relevant: ["P1-Z"] },
];

describe("retrieval eval metrics", () => {
  it("collapses chunk results into report order (first appearance wins)", () => {
    const order = reportOrderFromResults([result("P1-A", "chunk-1"), result("P1-A", "chunk-2"), result("P1-B")]);
    expect(order).toEqual(["P1-A", "P1-B"]);
  });

  it("scores rank, hit@5 and hit@10 at report level", () => {
    const scored = scoreRetrievalCase(CASES[1], ["P1-A", "P1-B", "P1-C", "P1-D"]);
    expect(scored.rank).toBe(3);
    expect(scored.hitAt5).toBe(true);
    const missed = scoreRetrievalCase(CASES[2], ["P1-A", "P1-B"]);
    expect(missed.rank).toBeNull();
    expect(missed.hitAt10).toBe(false);
  });

  it("computes recall and MRR across cases", async () => {
    const responses: Record<string, HybridSearchOutput> = {
      q1: output(["P1-A", "P1-B"]),
      q2: output(["P1-A", "P1-B", "P1-C"]),
      q3: output(["P1-A", "P1-B"]),
    };
    const summary = await runRetrievalEval(CASES, async (query) => responses[query], "test");
    expect(summary.recallAt5).toBeCloseTo(2 / 3, 4);
    expect(summary.recallAt10).toBeCloseTo(2 / 3, 4);
    // MRR = (1/1 + 1/3 + 0) / 3
    expect(summary.mrr).toBeCloseTo((1 + 1 / 3) / 3, 3);
  });

  it("renders a comparison when two modes are provided", async () => {
    const summary = await runRetrievalEval(CASES, async () => output(["P1-A", "P1-C", "P1-Z"]), "lexical-only");
    const summary2 = await runRetrievalEval(CASES, async () => output(["P1-A", "P1-C", "P1-Z"]), "hybrid");
    const rendered = renderRetrievalEval([summary, summary2]);
    expect(rendered).toContain("recall@5");
    expect(rendered).toContain("对比:hybrid vs lexical-only");
  });
});
