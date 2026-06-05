import { describe, expect, it } from "vitest";
import { cninfoAnnouncementToSource, fetchCninfoAnnualReports, selectRelevantCninfoSnippet } from "../src/connectors/cninfo.js";

describe("CNINFO connector", () => {
  it("maps annual report announcements to candidate-specific P0 source records", async () => {
    const source = await cninfoAnnouncementToSource(
      {
        secCode: "300308",
        secName: "中际旭创",
        orgId: "9900022016",
        announcementId: "1225056459",
        announcementTitle: "2025年年度报告",
        announcementTime: Date.parse("2026-03-31T00:00:00.000Z"),
        adjunctUrl: "finalpage/2026-03-31/1225056459.PDF",
        adjunctType: "PDF",
      },
      "中际旭创 年度报告 披露 光模块 CPO 相关业务。",
      ["光模块", "CPO"],
    );

    expect(source.id).toBe("P0-CNINFO-300308-1225056459");
    expect(source.tier).toBe("P0");
    expect(source.sourceType).toBe("primary");
    expect(source.title).toContain("300308");
    expect(source.summary).toContain("CPO");
    expect(source.evidenceTags).toContain("candidate-direct");
    expect(source.evidenceTags).toContain("光模块");
  });

  it("prioritizes business evidence windows over company header text", () => {
    const text = [
      "证券代码：300308 证券简称：中际旭创 第一节 重要提示。",
      "后文详细披露公司 800G 光模块、CPO、硅光相关产品客户验证进展。",
      "公司持续推进产能建设和良率提升。",
    ].join(" ");
    const snippet = selectRelevantCninfoSnippet(text, ["CPO", "光模块", "产能", "良率"], ["中际旭创", "300308"]);
    expect(snippet).toContain("CPO");
    expect(snippet).toContain("产能");
  });

  it("filters English annual report variants when querying CNINFO", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          announcements: [
            { announcementTitle: "2025年年度报告（英文版）", announcementId: "english" },
            { announcementTitle: "2025年年度报告摘要", announcementId: "summary" },
            { announcementTitle: "2025年年度报告", announcementId: "annual" },
          ],
        }),
      }) as Response;
    try {
      const reports = await fetchCninfoAnnualReports("002384", "9900000000");
      expect(reports.map((item) => item.announcementId)).toEqual(["annual"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
