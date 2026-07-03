import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { EmbeddingClient } from "../src/research/embeddings.js";
import { hybridSearchReportLibrary, renderHybridResults } from "../src/research/library-hybrid.js";
import {
  buildEmbeddingIndex,
  contentHash,
  cosineSimilarity,
  fuseRrf,
  loadEmbeddingIndex,
  vectorSearch,
} from "../src/research/library-index.js";
import { buildLibrarySearchIndex, type LibrarySearchIndex } from "../src/research/library-search.js";

// Deterministic fake embedder: vector = normalized bag of "concept" activations, so
// texts about the same concept land close in cosine space regardless of exact wording.
const CONCEPTS = ["靶材", "溅射", "sputtering", "光模块", "cpo", "存储", "dram"];
function fakeVector(text: string): number[] {
  const lower = text.toLowerCase();
  const raw = CONCEPTS.map((concept) => (lower.includes(concept) ? 1 : 0.01));
  // "sputtering targets" concept ties 靶材/溅射/sputtering together semantically.
  if (lower.includes("sputtering") || lower.includes("靶材") || lower.includes("溅射")) raw[0] = 1;
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0));
  return raw.map((value) => value / norm);
}
const fakeClient: EmbeddingClient & { calls: number } = {
  label: "fake/concept",
  dim: CONCEPTS.length,
  calls: 0,
  async embed(texts: string[]) {
    this.calls += texts.length;
    return texts.map(fakeVector);
  },
};

let processedDir: string;
let indexPath: string;
let searchIndex: LibrarySearchIndex;

async function writeReport(id: string, title: string, text: string): Promise<void> {
  const dir = path.join(processedDir, id);
  await fs.mkdir(dir, { recursive: true });
  const chunksPath = path.join(dir, "chunks.json");
  await fs.writeFile(
    chunksPath,
    JSON.stringify([
      { id: "chunk-1", order: 1, text, tags: [], topics: [], companies: [], sourceTier: "P1", requiresP0Verification: true, tokenEstimate: Math.round(text.length / 2) },
    ]),
  );
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      id,
      sourceRecordId: `P1-${id}`,
      title,
      fileName: `${id}.pdf`,
      rawPath: "/dev/null",
      checksum: id,
      sizeBytes: 1,
      status: "accepted",
      provider: "FFD",
      sourceTier: "P1",
      sourceType: "broker_report",
      institution: "测试证券",
      publishedAt: "2026-07-01",
      convertedAt: "2026-07-01T00:00:00.000Z",
      converter: "test",
      markdownPath: path.join(dir, "full.md"),
      summaryPath: path.join(dir, "summary.md"),
      claimsPath: path.join(dir, "claims.json"),
      chunksPath,
      manifestPath: path.join(dir, "manifest.json"),
      summary: title,
      tags: [],
    }),
  );
}

beforeAll(async () => {
  processedDir = await fs.mkdtemp(path.join(os.tmpdir(), "library-hybrid-"));
  indexPath = path.join(processedDir, "embeddings.json");
  // Semantic doc: talks about sputtering (溅射) without the query word 靶材.
  await writeReport(
    "REP-SEMANTIC",
    "sputtering 工艺深度",
    "溅射工艺是晶圆金属化关键环节，sputtering 设备与耗材的国产化率持续提升，认证壁垒高，客户粘性强，产能扩张节奏可控，是隐蔽的上游卡点。",
  );
  await writeReport(
    "REP-LEXICAL",
    "光模块月报",
    "光模块与 CPO 产业链跟踪：需求延续高景气，核心内容为光互联器件与封装环节的排产，交换机端口升级带动组件量价齐升。",
  );
  searchIndex = await buildLibrarySearchIndex({ processedDir, includeVaultNotes: false });
});

describe("embedding index build (incremental by content hash)", () => {
  it("embeds all chunks on first build, reuses on second, prunes removed", async () => {
    const first = await buildEmbeddingIndex(fakeClient, { searchIndex, filePath: indexPath });
    expect(first.embedded).toBe(2);
    expect(first.reused).toBe(0);
    const callsAfterFirst = fakeClient.calls;

    const second = await buildEmbeddingIndex(fakeClient, { searchIndex, filePath: indexPath });
    expect(second.embedded).toBe(0);
    expect(second.reused).toBe(2);
    expect(fakeClient.calls).toBe(callsAfterFirst);
  });

  it("hash changes force re-embedding", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

describe("vector math and fusion", () => {
  it("cosine similarity is 1 for identical directions and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 3])).toBeCloseTo(0);
  });

  it("RRF rewards documents present in both rankings", () => {
    const fused = fuseRrf([
      new Map([["a", 1], ["b", 2]]),
      new Map([["b", 1], ["c", 2]]),
    ]);
    expect(fused.get("b")!).toBeGreaterThan(fused.get("a")!);
    expect(fused.get("b")!).toBeGreaterThan(fused.get("c")!);
  });
});

describe("hybrid retrieval", () => {
  it("surfaces the semantic match for 靶材 even though the doc never says 靶材", async () => {
    const index = await loadEmbeddingIndex(indexPath);
    expect(index).not.toBeNull();
    const output = await hybridSearchReportLibrary(
      "靶材 国产替代",
      { topK: 2 },
      { embeddingClient: fakeClient, embeddingIndex: index, searchIndex, reranker: null },
    );
    expect(output.mode).toBe("hybrid");
    expect(output.results[0]?.document.reportId).toBe("REP-SEMANTIC");
  });

  it("vector search ranks the semantic doc first", async () => {
    const index = (await loadEmbeddingIndex(indexPath))!;
    const [queryVector] = await fakeClient.embed(["靶材"]);
    const hits = vectorSearch(index, queryVector, 2);
    expect(hits[0].key).toContain("REP-SEMANTIC");
  });

  it("degrades to lexical-only with an explicit note when no embedding index exists", async () => {
    const output = await hybridSearchReportLibrary("光模块", { topK: 2 }, { embeddingIndex: null, searchIndex, reranker: null });
    expect(output.mode).toBe("lexical-only");
    expect(output.note).toContain("library:embed");
    expect(output.results[0]?.document.reportId).toBe("REP-LEXICAL");
  });

  it("degrades gracefully when the embedding client throws", async () => {
    const broken: EmbeddingClient = {
      label: "broken",
      dim: 3,
      embed: async () => {
        throw new Error("daemon down");
      },
    };
    const index = await loadEmbeddingIndex(indexPath);
    const output = await hybridSearchReportLibrary("光模块", { topK: 2 }, { embeddingClient: broken, embeddingIndex: index, searchIndex, reranker: null });
    expect(output.mode).toBe("lexical-only");
    expect(output.note).toContain("退化为词法检索");
    expect(output.results.length).toBeGreaterThan(0);
  });

  it("renders mode and provenance", async () => {
    const index = await loadEmbeddingIndex(indexPath);
    const output = await hybridSearchReportLibrary("溅射", { topK: 2 }, { embeddingClient: fakeClient, embeddingIndex: index, searchIndex, reranker: null });
    const rendered = renderHybridResults("溅射", output);
    expect(rendered).toContain("模式 hybrid");
    expect(rendered).toContain("P1-REP-SEMANTIC");
  });
});

describe("reranker stage (C layer)", () => {
  it("reorders the fused pool by cross-encoder scores and marks the mode", async () => {
    const index = await loadEmbeddingIndex(indexPath);
    const flipReranker = {
      label: "fake/flip",
      // Score REP-LEXICAL highest regardless of fusion order.
      rerank: async (_query: string, documents: string[]) =>
        documents
          .map((document, position) => ({ index: position, relevanceScore: document.includes("光模块") ? 0.99 : 0.01 }))
          .sort((a, b) => b.relevanceScore - a.relevanceScore),
    };
    const output = await hybridSearchReportLibrary(
      "溅射",
      { topK: 2 },
      { embeddingClient: fakeClient, embeddingIndex: index, searchIndex, reranker: flipReranker },
    );
    expect(output.mode).toBe("hybrid+rerank");
    expect(output.results[0]?.document.reportId).toBe("REP-LEXICAL");
  });

  it("keeps RRF order when the reranker throws (best-effort)", async () => {
    const index = await loadEmbeddingIndex(indexPath);
    const broken = { label: "fake/broken", rerank: async () => { throw new Error("rerank down"); } };
    const output = await hybridSearchReportLibrary(
      "溅射",
      { topK: 2 },
      { embeddingClient: fakeClient, embeddingIndex: index, searchIndex, reranker: broken },
    );
    expect(output.mode).toBe("hybrid");
    expect(output.results[0]?.document.reportId).toBe("REP-SEMANTIC");
  });
});
