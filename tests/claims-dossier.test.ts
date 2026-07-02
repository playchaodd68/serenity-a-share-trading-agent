import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildClaimsEntityIndex, lookupCompanyClaims, summarizeClaimsIndex } from "../src/research/claims-index.js";
import { renderDossier } from "../src/research/dossier.js";
import { obsidianUriForPath } from "../src/research/obsidian-link.js";

let processedDir: string;

async function writeReport(id: string, title: string, claims: unknown[], status = "accepted"): Promise<void> {
  const dir = path.join(processedDir, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "claims.json"), JSON.stringify(claims));
  await fs.writeFile(path.join(dir, "chunks.json"), "[]");
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
      chunksPath: path.join(dir, "chunks.json"),
      manifestPath: path.join(dir, "manifest.json"),
      obsidianAcceptedPath: `/Users/apple/Documents/HenryXu/Serenity-A股产业投研/reports/FFD/Accepted/${id}-note.md`,
      summary: title,
      tags: [],
    }),
  );
}

function claim(id: string, text: string, companies: string[], polarity = "positive") {
  return { id, text, polarity, tags: [], companies, topics: ["主题A"], evidenceStrength: "context" };
}

beforeAll(async () => {
  processedDir = await fs.mkdtemp(path.join(os.tmpdir(), "claims-index-"));
  await writeReport("REP-1", "测试设备深度", [
    claim("c1", "长川科技测试机订单强劲", ["长川科技"]),
    claim("c2", "长川科技产能扩张", ["长川科技"]),
    claim("c3", "行业景气上行", ["中国"]),
  ]);
  await writeReport("REP-2", "靶材专题", [claim("c1", "江丰电子靶材份额提升", ["江丰电子"], "negative")]);
  await writeReport("REP-STAGED", "未接受报告", [claim("c1", "不应出现", ["幽灵公司"])], "staged");
});

describe("claims entity index (B layer)", () => {
  it("indexes accepted reports only and filters generic/short entities", async () => {
    const index = await buildClaimsEntityIndex(processedDir);
    expect(index.reportCount).toBe(2);
    expect(index.companies.has("长川科技")).toBe(true);
    expect(index.companies.has("幽灵公司")).toBe(false);
    expect(index.companies.has("中国")).toBe(false); // <3 chars filtered
    const summary = summarizeClaimsIndex(index);
    expect(summary.companyCount).toBe(2);
    expect(summary.claimCount).toBe(3);
  });

  it("lookup tolerates short forms in both directions", async () => {
    const index = await buildClaimsEntityIndex(processedDir);
    expect(lookupCompanyClaims(index, "长川").length).toBe(2);
    expect(lookupCompanyClaims(index, "江丰电子股份").length).toBe(1);
    expect(lookupCompanyClaims(index, "不存在")).toEqual([]);
  });
});

describe("company dossier rendering", () => {
  it("renders frontmatter, polarity badges, wikilinks, and the P0 discipline note", async () => {
    const index = await buildClaimsEntityIndex(processedDir);
    const refs = lookupCompanyClaims(index, "长川科技");
    const rendered = renderDossier("长川科技", refs, "2026-07-03T00:00:00.000Z");
    expect(rendered).toContain("type: company-dossier");
    expect(rendered).toContain("[[REP-1-note]]");
    expect(rendered).toContain("🟢");
    expect(rendered).toContain("未经候选级 P0 验证");
    expect(rendered).toContain("## 相关主题");
  });
});

describe("obsidian deep links", () => {
  it("builds an encoded obsidian:// URI for vault paths and null outside the vault", () => {
    const uri = obsidianUriForPath(
      "/Users/apple/Documents/HenryXu/Serenity-A股产业投研/reports/FFD/Accepted/示例.md",
      "/Users/apple/Documents/HenryXu",
    );
    expect(uri).toContain("obsidian://open?vault=HenryXu&file=");
    expect(uri).not.toContain(".md");
    expect(decodeURIComponent(uri!.split("file=")[1])).toBe("Serenity-A股产业投研/reports/FFD/Accepted/示例");
    expect(obsidianUriForPath("/tmp/elsewhere.md", "/Users/apple/Documents/HenryXu")).toBeNull();
  });
});
