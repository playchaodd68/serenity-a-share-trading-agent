import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildLibrarySearchIndex,
  renderLibrarySearchResults,
  scoreBm25,
  tokenize,
} from "../src/research/library-search.js";

async function writeFixtureReport(
  root: string,
  id: string,
  title: string,
  status: string,
  chunks: Array<{ text: string; sectionTitle?: string; companies?: string[]; topics?: string[] }>,
): Promise<void> {
  const dir = path.join(root, id);
  await fs.mkdir(dir, { recursive: true });
  const chunksPath = path.join(dir, "chunks.json");
  await fs.writeFile(
    chunksPath,
    JSON.stringify(
      chunks.map((chunk, index) => ({
        id: `chunk-${index + 1}`,
        order: index + 1,
        text: chunk.text,
        tags: [],
        sectionTitle: chunk.sectionTitle,
        topics: chunk.topics ?? [],
        companies: chunk.companies ?? [],
        sourceTier: "P1",
        requiresP0Verification: true,
        tokenEstimate: Math.max(Math.round(chunk.text.length / 2), 1),
      })),
    ),
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
      status,
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

const TARGET_TEXT =
  "江丰电子是国内高纯溅射靶材龙头，超高纯金属靶材用于半导体晶圆制造，客户认证周期长，国产替代空间大。公司靶材产能持续扩张，铜靶、铝靶、钛靶批量供应中芯国际等晶圆厂。";
const NOISE_TEXT =
  "本周光模块板块表现活跃，CPO 概念持续发酵，建议关注产业链上游光芯片与连接器环节的景气传导，行业需求超预期。";
const STAGED_TEXT = "存储芯片价格上行，DRAM 合约价连续三个月上涨，HBM 供不应求带动产业链景气。";

let processedDir: string;

beforeAll(async () => {
  processedDir = await fs.mkdtemp(path.join(os.tmpdir(), "library-search-"));
  await writeFixtureReport(processedDir, "REP-TARGET", "靶材深度：高纯溅射靶材国产替代", "accepted", [
    { text: TARGET_TEXT, sectionTitle: "核心逻辑", companies: ["江丰电子"], topics: ["半导体设备 / 材料国产替代"] },
    { text: "短", sectionTitle: "页眉碎片" },
  ]);
  await writeFixtureReport(processedDir, "REP-NOISE", "光模块周报", "accepted", [
    { text: NOISE_TEXT, sectionTitle: "行情回顾", topics: ["AI 光互连 / AI PCB / 先进封装"] },
  ]);
  await writeFixtureReport(processedDir, "REP-STAGED", "存储月报", "staged", [{ text: STAGED_TEXT }]);
});

describe("CJK tokenizer", () => {
  it("emits bigrams for CJK runs and whole words for latin/digits", () => {
    expect(tokenize("靶材涨价")).toEqual(["靶材", "材涨", "涨价"]);
    expect(tokenize("CPO 光模块 800G")).toEqual(["cpo", "光模", "模块", "800g"]);
    expect(tokenize("300666.SZ 江丰")).toContain("300666.sz");
    expect(tokenize("300666.SZ 江丰")).toContain("江丰");
  });
});

describe("library BM25 search over fixture corpus", () => {
  it("indexes accepted reports only by default and drops tiny fragments", async () => {
    const index = await buildLibrarySearchIndex({ processedDir });
    expect(index.reportCount).toBe(2);
    expect(index.documents.some((doc) => doc.document.sectionTitle === "页眉碎片")).toBe(false);
    expect(index.documents.some((doc) => doc.document.reportId === "REP-STAGED")).toBe(false);
  });

  it("includes staged reports when asked", async () => {
    const index = await buildLibrarySearchIndex({ processedDir, includeStaged: true });
    expect(index.reportCount).toBe(3);
  });

  it("ranks the target report first for a chokepoint query", async () => {
    const index = await buildLibrarySearchIndex({ processedDir });
    const results = scoreBm25(index, "溅射靶材 国产替代 认证");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].document.reportId).toBe("REP-TARGET");
    const noise = results.find((result) => result.document.reportId === "REP-NOISE");
    if (noise) expect(results[0].score).toBeGreaterThan(noise.score);
  });

  it("company-name query hits the report even though the title lacks the name", async () => {
    const index = await buildLibrarySearchIndex({ processedDir });
    const results = scoreBm25(index, "江丰电子");
    expect(results[0]?.document.reportId).toBe("REP-TARGET");
  });

  it("renders provenance with source ID and P1 warning", async () => {
    const index = await buildLibrarySearchIndex({ processedDir });
    const results = scoreBm25(index, "靶材").slice(0, 3);
    const rendered = renderLibrarySearchResults("靶材", results);
    expect(rendered).toContain("P1-REP-TARGET");
    expect(rendered).toContain("P1 卖方研报观点");
    expect(rendered).toContain("测试证券");
  });

  it("renders an actionable empty-result message", () => {
    expect(renderLibrarySearchResults("不存在的词", [], { reportCount: 2 })).toContain("未命中");
  });
});
