import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acceptFfdReport, enhanceFfdReports, listFfdReportManifests, processFfdReportLibrary, renderFfdReportReview } from "../src/research/report-library.js";

describe("FFD report library pipeline", () => {
  it("converts downloaded reports into staged markdown artifacts and accepted P1 sources", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ffd-report-library-"));
    const rawDir = path.join(root, "raw");
    const processedDir = path.join(root, "processed");
    const obsidianRoot = path.join(root, "obsidian");
    const rawSubdir = path.join(rawDir, "外资投行");
    await fs.mkdir(rawSubdir, { recursive: true });
    const rawPath = path.join(rawSubdir, "20260530_高盛_半导体CPO产业链跟踪.pdf");
    await fs.writeFile(rawPath, "synthetic pdf bytes", "utf8");
    await fs.writeFile(
      `${rawPath}.ffd-meta.json`,
      JSON.stringify({
        file_id: 12345,
        organization: "高盛",
        industry: "半导体",
        publish_date: "2026-05-30",
        tags: ["CPO", "产业链"],
      }),
      "utf8",
    );

    const run = await processFfdReportLibrary({
      rawDir,
      processedDir,
      obsidianRoot,
      now: "2026-06-02T00:00:00.000Z",
      converter: async () => ({
        converter: "test-converter",
        markdown: [
          "# 半导体 CPO 产业链跟踪",
          "",
          "AI 需求增长推动 CPO 光模块和硅光方案放量，800G 向 1.6T 升级带来 DSP、EML 和 PCB 供应链机会。",
          "",
          "高盛认为客户订单验证和产能扩张改善盈利，但风险包括价格下降、竞争加剧和客户自研。",
        ].join("\n"),
      }),
    });

    expect(run.processed).toHaveLength(1);
    const manifest = run.processed[0]!;
    expect(manifest.status).toBe("staged");
    expect(manifest.ffdFileId).toBe(12345);
    expect(manifest.metadataPath).toContain(".ffd-meta.json");
    expect(manifest.institution).toBe("高盛");
    expect(manifest.industry).toBe("半导体");
    expect(manifest.tags).toContain("CPO");
    expect(manifest.quality?.canAccept).toBe(true);
    expect(manifest.claimCount).toBeGreaterThan(0);
    expect(manifest.chunkCount).toBeGreaterThan(0);
    expect(manifest.sectionCount).toBeGreaterThan(0);
    expect(manifest.evidenceCount).toBeGreaterThan(0);
    expect(manifest.topics).toContain("AI 光互连 / AI PCB / 先进封装");
    expect(manifest.companies ?? []).toEqual([]);
    expect(await fs.readFile(manifest.summaryPath, "utf8")).toContain("Core Summary");
    expect(await fs.readFile(manifest.summaryPath, "utf8")).toContain("Investment Relevance");
    expect(await fs.readFile(manifest.summaryPath, "utf8")).toContain("Quality Gate");
    expect(await fs.readFile(manifest.sectionsPath!, "utf8")).toContain("半导体 CPO 产业链跟踪");
    expect(await fs.readFile(manifest.evidencePath!, "utf8")).toContain("customer_order_capacity");
    expect(await fs.readFile(manifest.canonicalPath!, "utf8")).toContain("ffd-report-canonical/v1");
    const chunks = JSON.parse(await fs.readFile(manifest.chunksPath, "utf8")) as Array<{ sourceTier?: string; requiresP0Verification?: boolean; sectionPath?: string[] }>;
    expect(chunks[0]?.sourceTier).toBe("P1");
    expect(chunks[0]?.requiresP0Verification).toBe(true);
    expect(chunks[0]?.sectionPath?.length).toBeGreaterThan(0);
    const claims = JSON.parse(await fs.readFile(manifest.claimsPath, "utf8")) as Array<{ evidenceKind?: string; requiresP0Verification?: boolean; chunkId?: string }>;
    expect(claims[0]?.evidenceKind).toBeTruthy();
    expect(claims[0]?.requiresP0Verification).toBe(true);
    expect(claims[0]?.chunkId).toBeTruthy();
    expect(await fs.readFile(manifest.obsidianStagingPath!, "utf8")).toContain("Accept with");
    expect(await fs.readFile(manifest.obsidianFullPath!, "utf8")).toContain("AI 需求增长");

    const listed = await listFfdReportManifests(processedDir);
    expect(listed.map((item) => item.id)).toContain(manifest.id);
    expect(renderFfdReportReview(listed)).toContain("高盛");

    const accepted = await acceptFfdReport(manifest.id, { processedDir, obsidianRoot });
    expect(accepted.manifest.status).toBe("accepted");
    expect(accepted.source.tier).toBe("P1");
    expect(accepted.source.sourceType).toBe("broker_report");
    expect(accepted.source.publisher).toContain("高盛");
    expect(accepted.source.evidenceTags).toContain("accepted");
    expect(await fs.readFile(accepted.manifest.obsidianAcceptedPath!, "utf8")).toContain("Status: `accepted`");
  });

  it("blocks low-quality FFD reports from accepted RAG unless explicitly bypassed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ffd-report-library-gate-"));
    const rawDir = path.join(root, "raw");
    const processedDir = path.join(root, "processed");
    const obsidianRoot = path.join(root, "obsidian");
    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(path.join(rawDir, "20260530_中信证券_每日晨会纪要.pdf"), "synthetic pdf bytes", "utf8");

    const run = await processFfdReportLibrary({
      rawDir,
      processedDir,
      obsidianRoot,
      now: "2026-06-02T00:00:00.000Z",
      converter: async () => ({
        converter: "test-converter",
        markdown: "每日晨会纪要，覆盖泛 AI 市场热点和短期指数观点。",
      }),
    });

    const manifest = run.processed[0]!;
    expect(manifest.quality?.canAccept).toBe(false);
    await expect(acceptFfdReport(manifest.id, { processedDir, obsidianRoot })).rejects.toThrow("quality gate");

    const accepted = await acceptFfdReport(manifest.id, { processedDir, obsidianRoot, bypassQualityGate: true });
    expect(accepted.manifest.status).toBe("accepted");
  });

  it("scans Word reports after FFD preserves their real docx extension", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ffd-report-library-docx-"));
    const rawDir = path.join(root, "raw");
    const processedDir = path.join(root, "processed");
    const obsidianRoot = path.join(root, "obsidian");
    await fs.mkdir(rawDir, { recursive: true });
    const rawPath = path.join(rawDir, "20260601_新易盛1.6T光模块放量在即.docx");
    await fs.writeFile(rawPath, "synthetic docx bytes", "utf8");

    const run = await processFfdReportLibrary({
      rawDir,
      processedDir,
      obsidianRoot,
      now: "2026-06-02T00:00:00.000Z",
      converter: async () => ({
        converter: "docx-test",
        markdown: "新易盛 1.6T 光模块订单放量，客户验证推进，产能扩张带来毛利率弹性。",
      }),
    });

    expect(run.processed).toHaveLength(1);
    expect(run.processed[0]!.fileName).toContain(".docx");
    expect(await fs.readFile(run.processed[0]!.summaryPath, "utf8")).toContain("Conversion Diagnostics");
  });

  it("enhances staged reports by default with the high-quality converter", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ffd-report-library-enhance-"));
    const rawDir = path.join(root, "raw");
    const processedDir = path.join(root, "processed");
    const obsidianRoot = path.join(root, "obsidian");
    await fs.mkdir(rawDir, { recursive: true });
    await fs.writeFile(path.join(rawDir, "20260530_高盛_半导体CPO产业链跟踪.pdf"), "synthetic pdf bytes", "utf8");

    const initial = await processFfdReportLibrary({
      rawDir,
      processedDir,
      obsidianRoot,
      now: "2026-06-02T00:00:00.000Z",
      converter: async () => ({
        converter: "fast-test",
        markdown: "半导体 CPO 产业链跟踪。",
      }),
    });
    const reportId = initial.processed[0]!.id;

    const enhanced = await enhanceFfdReports({
      rawDir,
      processedDir,
      obsidianRoot,
      now: "2026-06-03T00:00:00.000Z",
      converter: async () => ({
        converter: "mineru-test",
        markdown: [
          "# 半导体 CPO 产业链跟踪",
          "",
          "高盛专题跟踪显示，客户订单验证和产能扩张推动 CPO、硅光、800G 与 1.6T 光模块产业链机会。",
        ].join("\n"),
      }),
    });

    expect(enhanced.processed).toHaveLength(1);
    expect(enhanced.processed[0]!.id).toBe(reportId);
    expect(enhanced.processed[0]!.converter).toBe("mineru-test");
    expect(enhanced.processed[0]!.status).toBe("staged");
    expect(await fs.readFile(enhanced.processed[0]!.markdownPath, "utf8")).toContain("客户订单验证");
  });
});
