import { describe, expect, it } from "vitest";
import { evaluateValuationGate } from "../src/scoring/valuation-gate.js";

const DISCIPLINE = "估值是硬门槛,不可被叙事或瓶颈纯正度覆盖";

describe("evaluateValuationGate", () => {
  it("returns unknown/watchlist when pe is null and notes the missing data", () => {
    const result = evaluateValuationGate({ pe: null, expectationGapScore: 9 });
    expect(result.light).toBe("unknown");
    expect(result.maxBucket).toBe("watchlist");
    expect(result.reasons.join("\n")).toContain("估值数据缺失");
  });

  it("returns red/observe for negative pe", () => {
    const result = evaluateValuationGate({ pe: -12.5, expectationGapScore: 10 });
    expect(result.light).toBe("red");
    expect(result.maxBucket).toBe("observe");
    expect(result.reasons.join("\n")).toContain(DISCIPLINE);
  });

  it("returns red/observe at the pe=160 boundary regardless of expectation gap", () => {
    const result = evaluateValuationGate({ pe: 160, expectationGapScore: 10 });
    expect(result.light).toBe("red");
    expect(result.maxBucket).toBe("observe");
    expect(result.reasons.join("\n")).toContain(DISCIPLINE);
  });

  it("returns red/observe above 160", () => {
    const result = evaluateValuationGate({ pe: 320, expectationGapScore: 10 });
    expect(result.light).toBe("red");
    expect(result.maxBucket).toBe("observe");
  });

  it("returns yellow/watchlist at pe=159.9 when expectation gap >= 6", () => {
    const result = evaluateValuationGate({ pe: 159.9, expectationGapScore: 6 });
    expect(result.light).toBe("yellow");
    expect(result.maxBucket).toBe("watchlist");
    expect(result.reasons.join("\n")).toContain(DISCIPLINE);
  });

  it("returns red/observe at pe=159.9 when expectation gap < 6", () => {
    const result = evaluateValuationGate({ pe: 159.9, expectationGapScore: 5.9 });
    expect(result.light).toBe("red");
    expect(result.maxBucket).toBe("observe");
    expect(result.reasons.join("\n")).toContain(DISCIPLINE);
  });

  it("enters the yellow band exactly at pe=80", () => {
    const withGap = evaluateValuationGate({ pe: 80, expectationGapScore: 6 });
    expect(withGap.light).toBe("yellow");
    expect(withGap.maxBucket).toBe("watchlist");

    const withoutGap = evaluateValuationGate({ pe: 80, expectationGapScore: 0 });
    expect(withoutGap.light).toBe("red");
    expect(withoutGap.maxBucket).toBe("observe");
  });

  it("returns green/core at pe=79.9 (just below the yellow band)", () => {
    const result = evaluateValuationGate({ pe: 79.9, expectationGapScore: 0 });
    expect(result.light).toBe("green");
    expect(result.maxBucket).toBe("core");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("returns green/core for a typical cheap name", () => {
    const result = evaluateValuationGate({ pe: 18, expectationGapScore: 3 });
    expect(result.light).toBe("green");
    expect(result.maxBucket).toBe("core");
  });

  it("always carries the valuation discipline sentence on red and yellow lights", () => {
    const cases = [
      { pe: -1, expectationGapScore: 0 },
      { pe: 200, expectationGapScore: 10 },
      { pe: 100, expectationGapScore: 8 },
      { pe: 100, expectationGapScore: 1 },
    ];
    for (const input of cases) {
      const result = evaluateValuationGate(input);
      expect(["red", "yellow"]).toContain(result.light);
      expect(result.reasons.join("\n")).toContain(DISCIPLINE);
    }
  });
});
