import { describe, expect, it } from "vitest";
import { containsCommonTraditionalChinese, toSimplifiedChinese } from "../src/utils/chinese.js";

describe("Chinese normalization", () => {
  it("converts Traditional Chinese finance/research wording to Simplified Chinese", () => {
    const text = toSimplifiedChinese("產業邏輯與資金發酵，臺灣軟體資訊後續驗證。");

    expect(text).toBe("产业逻辑与资金发酵，台湾软件信息后续验证。");
    expect(containsCommonTraditionalChinese(text)).toBe(false);
  });
});
