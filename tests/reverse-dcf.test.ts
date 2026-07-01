import { describe, expect, it } from "vitest";
import { assessExpectationsGap, dcfPresentValue, impliedGrowthRate } from "../src/research/reverse-dcf.js";
import type { ReverseDcfInputs } from "../src/research/reverse-dcf.js";

const base: ReverseDcfInputs = {
  marketValue: 0, // set per test
  baseCashFlow: 100,
  discountRate: 0.1,
  terminalGrowth: 0.03,
  explicitYears: 10,
};

describe("reverse DCF", () => {
  it("present value increases monotonically with the growth assumption", () => {
    const low = dcfPresentValue(100, 0.05, 0.1, 0.03, 10);
    const high = dcfPresentValue(100, 0.15, 0.1, 0.03, 10);
    expect(high).toBeGreaterThan(low);
  });

  it("throws when the discount rate does not exceed terminal growth", () => {
    expect(() => dcfPresentValue(100, 0.05, 0.03, 0.03, 10)).toThrow();
  });

  it("throws on inverted or non-positive inputs rather than returning a wrong number", () => {
    expect(() => impliedGrowthRate({ ...base, marketValue: 1500 }, { lowerBound: 0.5, upperBound: -0.5 })).toThrow();
    expect(() => impliedGrowthRate({ ...base, marketValue: 1500, baseCashFlow: 0 })).toThrow();
  });

  it("recovers the growth rate that a price implies (round-trip)", () => {
    const trueGrowth = 0.12;
    const price = dcfPresentValue(base.baseCashFlow, trueGrowth, base.discountRate, base.terminalGrowth, base.explicitYears);
    const implied = impliedGrowthRate({ ...base, marketValue: price });
    expect(implied).toBeCloseTo(trueGrowth, 4);
  });

  it("implies higher growth for a richer price", () => {
    const cheap = impliedGrowthRate({ ...base, marketValue: 1500 });
    const rich = impliedGrowthRate({ ...base, marketValue: 3000 });
    expect(rich).toBeGreaterThan(cheap);
  });

  it("flags priced-in when market-implied growth exceeds the thesis growth", () => {
    const gap = assessExpectationsGap(0.2, 0.1);
    expect(gap.verdict).toBe("priced-in");
    expect(gap.gapPct).toBeCloseTo(0.1, 10);
  });

  it("flags a positive expectation gap when the market implies less than the thesis", () => {
    const gap = assessExpectationsGap(0.05, 0.15);
    expect(gap.verdict).toBe("positive-expectation-gap");
  });

  it("flags in-line when implied and thesis growth are within the band", () => {
    expect(assessExpectationsGap(0.1, 0.11).verdict).toBe("in-line");
  });
});
