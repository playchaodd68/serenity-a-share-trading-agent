import { describe, expect, it } from "vitest";
import { evaluateRedFlags, renderRedFlags } from "../src/scoring/red-flags.js";
import type { FinancialSnapshotInput } from "../src/scoring/red-flags.js";

// 全绿基线：所有指标健康，不触发任何红旗。
function cleanInput(overrides: Partial<FinancialSnapshotInput> = {}): FinancialSnapshotInput {
  return {
    revenueGrowthYoY: 0.2,
    inventoryGrowthYoY: 0.2,
    receivablesGrowthYoY: 0.2,
    grossMarginTrendPp: 1.5,
    claimsScarcity: false,
    plannedDilution: false,
    pledgeRatio: 0.1,
    singleUnnamedCustomer: false,
    ...overrides,
  };
}

describe("evaluateRedFlags", () => {
  it("returns no flags for a clean snapshot", () => {
    expect(evaluateRedFlags(cleanInput())).toEqual([]);
  });

  it("flags inventory growth exceeding revenue growth by more than 15pp as warning", () => {
    const flags = evaluateRedFlags(cleanInput({ revenueGrowthYoY: 0.1, inventoryGrowthYoY: 0.4 }));
    const flag = flags.find((item) => item.id === "inventory-divergence");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("warning");
    expect(flag?.detail).toContain("存货应收背离");
  });

  it("does not flag inventory divergence at exactly 15pp", () => {
    const flags = evaluateRedFlags(cleanInput({ revenueGrowthYoY: 0, inventoryGrowthYoY: 0.15 }));
    expect(flags.some((item) => item.id === "inventory-divergence")).toBe(false);
  });

  it("flags receivables growth exceeding revenue growth by more than 15pp as warning", () => {
    const flags = evaluateRedFlags(cleanInput({ revenueGrowthYoY: 0.05, receivablesGrowthYoY: 0.5 }));
    const flag = flags.find((item) => item.id === "receivables-divergence");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("warning");
  });

  it("skips divergence rules when revenue growth is null", () => {
    const flags = evaluateRedFlags(
      cleanInput({ revenueGrowthYoY: null, inventoryGrowthYoY: 5, receivablesGrowthYoY: 5 }),
    );
    expect(flags.some((item) => item.id === "inventory-divergence")).toBe(false);
    expect(flags.some((item) => item.id === "receivables-divergence")).toBe(false);
  });

  it("skips the inventory rule when inventory growth is null", () => {
    const flags = evaluateRedFlags(cleanInput({ inventoryGrowthYoY: null }));
    expect(flags.some((item) => item.id === "inventory-divergence")).toBe(false);
  });

  it("flags scarcity claims with flat-or-falling gross margin as critical", () => {
    const flags = evaluateRedFlags(cleanInput({ claimsScarcity: true, grossMarginTrendPp: -2 }));
    const flag = flags.find((item) => item.id === "scarcity-margin-mismatch");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("critical");
    expect(flag?.detail).toContain("自称稀缺但毛利率不升");
  });

  it("treats zero gross-margin change under a scarcity claim as a hit, and rising margin as safe", () => {
    const zero = evaluateRedFlags(cleanInput({ claimsScarcity: true, grossMarginTrendPp: 0 }));
    expect(zero.some((item) => item.id === "scarcity-margin-mismatch")).toBe(true);

    const rising = evaluateRedFlags(cleanInput({ claimsScarcity: true, grossMarginTrendPp: 3 }));
    expect(rising.some((item) => item.id === "scarcity-margin-mismatch")).toBe(false);
  });

  it("skips the scarcity rule when gross margin trend is null", () => {
    const flags = evaluateRedFlags(cleanInput({ claimsScarcity: true, grossMarginTrendPp: null }));
    expect(flags.some((item) => item.id === "scarcity-margin-mismatch")).toBe(false);
  });

  it("flags planned dilution as critical", () => {
    const flags = evaluateRedFlags(cleanInput({ plannedDilution: true }));
    const flag = flags.find((item) => item.id === "planned-dilution");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("critical");
    expect(flag?.detail).toContain("兑现前先融资");
  });

  it("flags pledge ratio at or above 0.5 as warning and skips null", () => {
    const hit = evaluateRedFlags(cleanInput({ pledgeRatio: 0.5 }));
    expect(hit.find((item) => item.id === "high-pledge-ratio")?.severity).toBe("warning");

    const below = evaluateRedFlags(cleanInput({ pledgeRatio: 0.49 }));
    expect(below.some((item) => item.id === "high-pledge-ratio")).toBe(false);

    const missing = evaluateRedFlags(cleanInput({ pledgeRatio: null }));
    expect(missing.some((item) => item.id === "high-pledge-ratio")).toBe(false);
  });

  it("flags a single unnamed large customer as warning", () => {
    const flags = evaluateRedFlags(cleanInput({ singleUnnamedCustomer: true }));
    const flag = flags.find((item) => item.id === "single-unnamed-customer");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("warning");
  });

  it("can trigger multiple flags at once", () => {
    const flags = evaluateRedFlags(
      cleanInput({
        revenueGrowthYoY: 0,
        inventoryGrowthYoY: 0.5,
        receivablesGrowthYoY: 0,
        plannedDilution: true,
        pledgeRatio: 0.8,
        singleUnnamedCustomer: true,
      }),
    );
    expect(flags.length).toBe(4);
  });
});

describe("renderRedFlags", () => {
  it("renders a clean report when no flags are present", () => {
    const text = renderRedFlags([]);
    expect(text).toContain("未触发任何红旗");
  });

  it("renders each flag with its severity badge", () => {
    const flags = evaluateRedFlags(cleanInput({ plannedDilution: true, singleUnnamedCustomer: true }));
    const text = renderRedFlags(flags);
    expect(text).toContain("【严重】");
    expect(text).toContain("【警告】");
    expect(text).toContain("planned-dilution");
  });

  it("notes coverage gaps for missing data instead of silently passing", () => {
    const input = cleanInput({
      revenueGrowthYoY: null,
      grossMarginTrendPp: null,
      claimsScarcity: true,
      pledgeRatio: null,
    });
    const text = renderRedFlags(evaluateRedFlags(input), input);
    expect(text).toContain("覆盖缺口");
    expect(text).toContain("营收增速缺失");
    expect(text).toContain("毛利率变动缺失");
    expect(text).toContain("质押比例缺失");
  });

  it("omits the coverage-gap section when all data is present", () => {
    const input = cleanInput();
    const text = renderRedFlags(evaluateRedFlags(input), input);
    expect(text).not.toContain("覆盖缺口");
  });
});
