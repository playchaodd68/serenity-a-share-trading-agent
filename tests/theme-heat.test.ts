import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import { computeHotThemeDowngrades, renderHotThemeDowngrades } from "../src/research/theme-heat.js";
import type { AShareStock, SourceRecord } from "../src/types.js";

function stock(overrides: Partial<AShareStock>): AShareStock {
  return {
    code: "300001",
    name: "测试股",
    latestPrice: 20,
    pctChange: 0.5,
    totalMarketCap: 20_000_000_000,
    floatMarketCap: 10_000_000_000,
    pe: 40,
    turnover: 1.5,
    mainNetInflow: 0,
    industry: "通信设备",
    region: "测试",
    concept: "CPO 光模块",
    ...overrides,
  };
}

const p0: SourceRecord = {
  id: "P0-300002-ANNUAL",
  title: "300002 年报",
  tier: "P0",
  sourceType: "primary",
  publisher: "CNINFO",
  observedAt: "2026-06-01",
  summary: "机器人 减速器 丝杠 客户定点 产能",
  evidenceTags: ["300002", "测试机器人", "candidate-direct", "机器人"],
};

describe("hot-theme downgrade slot", () => {
  it("downgrades hot themes that lack strong evidence", () => {
    const hotNoEvidence = scoreCandidate(stock({ code: "300001", name: "热门光模块", pctChange: 8, turnover: 14 }), []);
    const entries = computeHotThemeDowngrades([hotNoEvidence]);
    const optical = entries.find((entry) => entry.themeId === "ai-optical-cpo");
    expect(optical).toBeDefined();
    expect(optical!.downgraded).toBe(true);
    expect(optical!.reason).toContain("热度≠增量证据");
  });

  it("does not downgrade hot themes backed by strong evidence", () => {
    const hotWithP0 = scoreCandidate(
      stock({ code: "300002", name: "测试机器人", concept: "机器人 减速器 丝杠", industry: "机械", pctChange: 8, turnover: 14 }),
      [p0],
    );
    const entries = computeHotThemeDowngrades([hotWithP0]);
    const robotics = entries.find((entry) => entry.themeId === "robotics-supply-chain");
    expect(robotics).toBeDefined();
    expect(robotics!.hasStrongEvidence).toBe(true);
    expect(robotics!.downgraded).toBe(false);
    expect(robotics!.reason).toContain("不降级");
  });

  it("keeps cool themes listed without downgrade", () => {
    const calm = scoreCandidate(stock({ pctChange: 0.2, turnover: 0.8 }), []);
    const entries = computeHotThemeDowngrades([calm]);
    expect(entries[0]?.downgraded).toBe(false);
    expect(entries[0]?.reason).toContain("未达降级评审线");
  });

  it("sorts by heat descending and renders a forced slot", () => {
    const hot = scoreCandidate(stock({ code: "300001", name: "热门光模块", pctChange: 8, turnover: 14 }), []);
    const calm = scoreCandidate(stock({ code: "300003", name: "半导体设备股", concept: "半导体 刻蚀 材料", industry: "半导体", pctChange: 0.1, turnover: 0.5 }), []);
    const entries = computeHotThemeDowngrades([hot, calm]);
    expect(entries[0]!.heatScore).toBeGreaterThanOrEqual(entries.at(-1)!.heatScore);
    const rendered = renderHotThemeDowngrades(entries);
    expect(rendered).toContain("[降级]");
    expect(rendered).toContain("热度≠增量证据");
  });

  it("renders an explicit empty-slot message when nothing matched", () => {
    expect(renderHotThemeDowngrades([])).toContain("热门降级槽为空");
  });
});
