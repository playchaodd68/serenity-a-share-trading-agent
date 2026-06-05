import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ingestLocalReportSources } from "../src/connectors/reports.js";

describe("local report ingestion", () => {
  it("extracts text summaries and evidence tags from local reports", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "serenity-report-inbox-"));
    await fs.writeFile(path.join(dir, "688999-cpo.md"), "测试硅光 688999 披露 CPO 光模块客户验证、产能建设和良率提升。", "utf8");

    const sources = await ingestLocalReportSources(dir);
    expect(sources).toHaveLength(1);
    expect(sources[0].summary).toContain("测试硅光");
    expect(sources[0].summary).toContain("688999");
    expect(sources[0].evidenceTags).toContain("CPO");
    expect(sources[0].evidenceTags).toContain("产能");
  });
});
