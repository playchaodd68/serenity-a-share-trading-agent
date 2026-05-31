import { describe, expect, it } from "vitest";
import { mergeSources } from "../src/sources/registry.js";
import type { SourceRecord } from "../src/types.js";

describe("source registry", () => {
  it("deduplicates by id and merges evidence tags", () => {
    const base: SourceRecord = {
      id: "A",
      title: "old",
      tier: "P2",
      sourceType: "social",
      publisher: "x",
      observedAt: "2026-01-01",
      summary: "old",
      evidenceTags: ["one"],
    };
    const merged = mergeSources([base], [{ ...base, title: "new", evidenceTags: ["two"] }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe("new");
    expect(merged[0]?.evidenceTags.sort()).toEqual(["one", "two"]);
  });
});
