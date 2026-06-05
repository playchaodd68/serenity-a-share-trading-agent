import { describe, expect, it } from "vitest";
import { SEED_SOURCES } from "../src/sources/seed.js";
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

  it("registers serenity-reply as bounded methodology input", () => {
    const distillation = SEED_SOURCES.find((source) => source.id === "SERENITY-REPLY-DISTILLATION-20260530");
    const evals = SEED_SOURCES.find((source) => source.id === "SERENITY-REPLY-EVALS-20260530");

    expect(distillation).toMatchObject({
      tier: "P1",
      sourceType: "repo",
      publisher: "GitHub / leslieyeo",
      url: "https://github.com/leslieyeo/serenity-reply",
    });
    expect(distillation?.summary).toContain("methodology input only");
    expect(distillation?.summary).toContain("not as primary company evidence");
    expect(evals?.evidenceTags).toContain("red-team");
  });

  it("registers public candidate P1 research sources without treating them as primary evidence", () => {
    const candidateResearch = SEED_SOURCES.filter((source) => source.sourceType === "broker_report" && source.evidenceTags.includes("broker-report"));
    expect(candidateResearch.map((source) => source.id)).toEqual(
      expect.arrayContaining([
        "P1-SINA-300308-RESEARCH-20260531",
        "P1-DFCF-300502-RESEARCH-20260527",
        "P1-SINA-002384-RESEARCH-202605",
        "P1-SINA-688072-RESEARCH-202604",
        "P1-SINA-688017-RESEARCH-202605",
      ]),
    );
    expect(candidateResearch.every((source) => source.tier === "P1")).toBe(true);
  });
});
