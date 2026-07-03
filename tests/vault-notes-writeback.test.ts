import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildLibrarySearchIndex, scoreBm25 } from "../src/research/library-search.js";
import { chunkNote, loadVaultNoteDocuments } from "../src/research/vault-notes.js";
import { findDuplicateOf, normalizeReportTitle } from "../src/research/report-library.js";
import { renderBearCaseNote, renderScreenRunNote } from "../src/research/obsidian-writeback.js";
import type { BearCaseRecord } from "../src/research/debate/bear-case.js";
import type { ScreenRun } from "../src/types.js";

let kbPath: string;
let processedDir: string;

beforeAll(async () => {
  kbPath = await fs.mkdtemp(path.join(os.tmpdir(), "vault-kb-"));
  processedDir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-processed-"));
  await fs.mkdir(path.join(kbPath, "industries"), { recursive: true });
  await fs.mkdir(path.join(kbPath, "methodology"), { recursive: true });
  await fs.mkdir(path.join(kbPath, "companies"), { recursive: true });
  await fs.mkdir(path.join(kbPath, "reports/FFD/Accepted"), { recursive: true });
  await fs.writeFile(
    path.join(kbPath, "industries", "光模块观察.md"),
    "---\ntype: note\n---\n# 光模块观察\n\n我的判断：光模块环节的超额收益已经进入后半段，需要向上游光芯片寻找新的不对称性,证据还不足但值得跟踪。",
  );
  await fs.writeFile(
    path.join(kbPath, "methodology", "方法论.md"),
    "# 方法论\n\n供应链卡点研究:从时代主线下钻到下一层瓶颈,需求供给缺口价格单位利润公司弹性逐环节量化拆解验证。",
  );
  // companies/ note must NOT be indexed (auto-generated duplicates)
  await fs.writeFile(path.join(kbPath, "companies", "某公司.md"), "# 某公司\n\n不应进入检索索引的档案内容,自动生成重复。");
});

describe("A-layer: vault notes join the retrieval index with tier isolation", () => {
  it("chunkNote strips frontmatter and merges paragraphs", () => {
    const chunks = chunkNote("---\na: b\n---\n# 标题\n\n第一段内容不短于最小限制,包含足够多的中文字符来通过阈值。\n\n第二段同样有内容。");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).not.toContain("a: b");
  });

  it("assigns user-thesis to hand-written dirs and system-note to generated dirs", async () => {
    const documents = await loadVaultNoteDocuments(kbPath);
    const userNote = documents.find((doc) => doc.reportId.includes("industries"));
    const systemNote = documents.find((doc) => doc.reportId.includes("methodology"));
    expect(userNote?.sourceTier).toBe("user-thesis");
    expect(systemNote?.sourceTier).toBe("system-note");
    expect(documents.some((doc) => doc.reportId.includes("companies"))).toBe(false);
  });

  it("vault notes are retrievable through the search index", async () => {
    const index = await buildLibrarySearchIndex({ processedDir, vaultKbPath: kbPath });
    const results = scoreBm25(index, "光芯片 不对称性");
    expect(results[0]?.document.sourceTier).toBe("user-thesis");
    expect(results[0]?.document.notePath).toContain("光模块观察.md");
  });

  it("can be excluded via includeVaultNotes=false", async () => {
    const index = await buildLibrarySearchIndex({ processedDir, vaultKbPath: kbPath, includeVaultNotes: false });
    expect(index.documents.length).toBe(0);
  });
});

describe("A-layer: acceptance dedup", () => {
  const manifest = (id: string, title: string, checksum: string, publishedAt = "2026-06-04", institution = "国金证券") =>
    ({ id, title, checksum, publishedAt, institution, status: "staged" }) as never;

  it("detects checksum duplicates and near-duplicate titles (real-world pair)", () => {
    const accepted = [manifest("A", "深度个股 20260604 国金证券 骄成超声 688392 超声设备平台型龙头多点开花", "sum-1")];
    expect(findDuplicateOf(manifest("B", "完全不同标题的另一篇报告", "sum-1"), accepted)?.reason).toBe("checksum");
    expect(
      findDuplicateOf(manifest("C", "20260604 国金证券 骄成超声公司深度研究超声设备平台型龙头，多点开花需求强劲", "sum-2"), accepted)?.reason,
    ).toBe("title");
    expect(findDuplicateOf(manifest("D", "20260611 国盛证券 玻璃基板系列报告AI算力时代先进封装核心材料", "sum-3"), accepted)).toBeNull();
  });

  it("short normalized titles never title-match (guard against false positives)", () => {
    expect(normalizeReportTitle("周报 2026-06").length).toBeLessThan(8);
    const accepted = [manifest("A", "周报 2026-06", "x")];
    expect(findDuplicateOf(manifest("B", "周报 2026-07", "y"), accepted)).toBeNull();
  });
});

describe("F-layer: research outputs write back to the vault", () => {
  it("renders a bear-case note with frontmatter, verdict, and discipline footer", () => {
    const record: BearCaseRecord = {
      code: "300308",
      name: "中际旭创",
      generatedAt: "2026-07-03T00:00:00.000Z",
      model: "test",
      status: "completed",
      report: {
        steelMan: "正方最强逻辑陈述,长度满足 schema 最低要求以便测试通过。",
        failureFindings: [
          { questionId: "second-source", finding: "二次供货认证推进", severity: "high", evidenceRefs: ["S1"], confidence: 0.7 },
        ],
        bearArguments: [{ claim: "份额与议价权双降风险", evidenceRefs: ["S1"] }],
        keyQuestions: ["认证进度的 P0 证据?"],
        killCriterionCandidates: [],
        verdict: "weakened",
      } as never,
    };
    const note = renderBearCaseNote(record, { rating: "neutral", rationale: "理由", bearVerdict: "weakened" }, "[[中际旭创]]", "2026-07-03T01:00:00.000Z");
    expect(note).toContain("type: bear-case");
    expect(note).toContain("[[中际旭创]]");
    expect(note).toContain("失效五问");
    expect(note).toContain("不构成投资建议");
  });

  it("renders a screen-run note with downgrade slot and dossier links", () => {
    const run = {
      runId: "screen-test",
      generatedAt: "2026-07-03T00:00:00.000Z",
      totalStocksScanned: 5000,
      candidates: [
        { stock: { code: "300308", name: "中际旭创" }, score: 93.7, confidence: "medium" },
      ],
      sourceCount: 10,
      hotThemeDowngrades: [
        { themeId: "t", label: "热门主题X", heatScore: 30, avgTurnover: 10, avgPctChange: 5, candidateCount: 3, hasStrongEvidence: false, downgraded: true, reason: "热度≠增量证据" },
      ],
    } as unknown as ScreenRun;
    const note = renderScreenRunNote(run, ["[[中际旭创]]"], "2026-07-03T01:00:00.000Z");
    expect(note).toContain("type: screen-run");
    expect(note).toContain("热门主题X");
    expect(note).toContain("[[中际旭创]]");
  });
});
