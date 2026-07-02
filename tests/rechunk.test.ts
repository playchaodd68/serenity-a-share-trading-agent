import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { rechunkFfdReports, type FfdReportChunk } from "../src/research/report-library.js";

const PARAGRAPH =
  "光模块行业景气持续上行，头部厂商产能利用率维持高位，上游光芯片与磷化铟衬底供给偏紧，客户认证周期较长，订单能见度延伸至明年上半年，单位毛利在产品结构升级带动下稳步改善。";

const TABLE = [
  "| 公司 | 环节 | 产能 |",
  "| --- | --- | --- |",
  "| 甲公司 | 光芯片 | 10万片 |",
  "| 乙公司 | 靶材 | 5000吨 |",
].join("\n");

const BOILERPLATE_SECTION = [
  "## 免责声明",
  "本报告仅供参考，不构成投资建议。本公司不对使用本报告所引致的任何损失承担责任。评级说明详见公司官网。",
].join("\n");

let processedDir: string;
let chunksPath: string;

beforeAll(async () => {
  processedDir = await fs.mkdtemp(path.join(os.tmpdir(), "rechunk-"));
  const dir = path.join(processedDir, "REP-1");
  await fs.mkdir(dir, { recursive: true });
  const body = [
    "# 光模块行业深度",
    "证券研究报告 | 行业专题研究",
    "敬请参阅最后一页特别声明",
    "",
    "## 核心观点",
    ...Array.from({ length: 60 }, (_, index) => `${PARAGRAPH}（第${index + 1}段）`),
    "",
    "## 产能对比",
    TABLE,
    "",
    BOILERPLATE_SECTION,
    "",
    "扫码获取更多服务",
    "3",
  ].join("\n\n");
  const markdownPath = path.join(dir, "full.md");
  chunksPath = path.join(dir, "chunks.json");
  const claimsPath = path.join(dir, "claims.json");
  await fs.writeFile(markdownPath, body);
  await fs.writeFile(chunksPath, JSON.stringify([{ id: "chunk-1", order: 1, text: "旧切块", tags: [], tokenEstimate: 4 }]));
  await fs.writeFile(claimsPath, "[]");
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      id: "REP-1",
      title: "光模块行业深度",
      fileName: "rep1.pdf",
      rawPath: "/dev/null",
      checksum: "REP-1",
      sizeBytes: 1,
      status: "accepted",
      provider: "FFD",
      sourceTier: "P1",
      sourceType: "broker_report",
      convertedAt: "2026-07-01T00:00:00.000Z",
      converter: "test",
      markdownPath,
      summaryPath: path.join(dir, "summary.md"),
      claimsPath,
      chunksPath,
      manifestPath: path.join(dir, "manifest.json"),
      summary: "test",
      tags: ["光模块"],
    }),
  );
});

describe("P0-3 rechunk: token-bounded chunks with overlap, tables intact, boilerplate stripped", () => {
  it("rebuilds chunks within the token budget and drops boilerplate", async () => {
    const run = await rechunkFfdReports(processedDir);
    expect(run.rebuilt).toBe(1);
    const chunks = JSON.parse(await fs.readFile(chunksPath, "utf8")) as FfdReportChunk[];
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(820);
    }
    const allText = chunks.map((chunk) => chunk.text).join("\n");
    expect(allText).not.toContain("免责声明");
    expect(allText).not.toContain("敬请参阅最后一页");
    expect(allText).not.toContain("扫码获取更多服务");
    expect(allText).toContain("光模块行业景气");
  });

  it("keeps markdown tables intact inside a single chunk", async () => {
    const chunks = JSON.parse(await fs.readFile(chunksPath, "utf8")) as FfdReportChunk[];
    const tableChunk = chunks.find((chunk) => chunk.text.includes("| 甲公司 |"));
    expect(tableChunk).toBeDefined();
    expect(tableChunk!.text).toContain("| 乙公司 | 靶材 | 5000吨 |");
  });

  it("adds overlap between consecutive body chunks", async () => {
    const chunks = (JSON.parse(await fs.readFile(chunksPath, "utf8")) as FfdReportChunk[]).filter((chunk) =>
      chunk.text.includes("光模块行业景气"),
    );
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const first = chunks[0].text;
    const second = chunks[1].text;
    const tail = first.slice(-80);
    // The second chunk should start with material carried over from the first.
    expect(second.slice(0, 400)).toContain(tail.slice(tail.length - 40));
  });

  it("emits no page-number or micro crumbs", async () => {
    const chunks = JSON.parse(await fs.readFile(chunksPath, "utf8")) as FfdReportChunk[];
    expect(chunks.some((chunk) => /^\d+$/.test(chunk.text.trim()))).toBe(false);
    for (const chunk of chunks) {
      const isTable = chunk.text.includes("|");
      expect(chunk.tokenEstimate >= 15 || isTable, `crumb chunk: ${chunk.text.slice(0, 40)}`).toBe(true);
    }
  });
});
