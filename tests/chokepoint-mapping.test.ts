import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import { SEED_SOURCES } from "../src/sources/seed.js";
import { isSerenityFrameworkSource } from "../src/sources/serenity-boundary.js";
import { SERENITY_DERIVED_CONCEPTS, proposeThemeExtension } from "../src/research/chokepoint-library.js";
import { buildChokePointProvenance, decideMapStatus, geopoliticalNotes } from "../src/research/chokepoint-mapping.js";
import type { AShareStock, ChokePointConcept, SourceRecord } from "../src/types.js";

const OPTICAL: AShareStock = {
  code: "300308",
  name: "中际旭创",
  latestPrice: 120,
  pctChange: 2.1,
  totalMarketCap: 20_000_000_000,
  floatMarketCap: 10_000_000_000,
  pe: 35,
  turnover: 4,
  mainNetInflow: 1_000_000,
  industry: "通信设备",
  region: "山东板块",
  concept: "CPO 光模块 硅光 激光器",
};

const CPO_CONCEPT = SERENITY_DERIVED_CONCEPTS.find((concept) => concept.id === "cpo-laser-diodes")!;

describe("serenity boundary guard", () => {
  it("flags Serenity framework and social sources, not independent A-share research", () => {
    const archive = SEED_SOURCES.find((source) => source.id === "SERENITY-ALEABITOREDDIT-ARCHIVE-20260611")!;
    const sive = SEED_SOURCES.find((source) => source.id === "SERENITY-X-ARTICLE-SIVE-20260519")!;
    const distillation = SEED_SOURCES.find((source) => source.id === "SERENITY-REPLY-DISTILLATION-20260530")!;
    const brokerReport = SEED_SOURCES.find((source) => source.id === "P1-SINA-300308-RESEARCH-20260531")!;

    expect(isSerenityFrameworkSource(archive)).toBe(true);
    expect(isSerenityFrameworkSource(sive)).toBe(true);
    expect(isSerenityFrameworkSource(distillation)).toBe(true);
    expect(isSerenityFrameworkSource(brokerReport)).toBe(false);
  });
});

describe("chokepoint provenance partition", () => {
  it("never lets a Serenity source land in candidate-level P0", () => {
    const candidate = scoreCandidate(OPTICAL, SEED_SOURCES);
    const provenance = buildChokePointProvenance(candidate, CPO_CONCEPT, SEED_SOURCES, "clean-equivalent");

    expect(provenance.candidateLevelP0.every((source) => !/^SERENITY[-_]/i.test(source.id))).toBe(true);
    expect(provenance.corroboratingAShareSources.every((source) => !isSerenityFrameworkSource(source))).toBe(true);
    expect(provenance.serenityContext.map((source) => source.id)).toContain("SERENITY-X-ARTICLE-SIVE-20260519");
  });

  it("places candidate-specific P0 (non-Serenity) into candidateLevelP0", () => {
    const p0: SourceRecord = {
      id: "P0-300308-ANNUAL",
      title: "300308 中际旭创 2025 年报",
      tier: "P0",
      sourceType: "primary",
      publisher: "CNINFO",
      observedAt: "2026-06-01",
      summary: "中际旭创披露 CPO 光模块、硅光客户验证与产能建设、订单、价格与 Q2 业绩兑现。",
      evidenceTags: ["300308", "中际旭创", "CPO", "硅光", "candidate-direct"],
    };
    const candidate = scoreCandidate(OPTICAL, [...SEED_SOURCES, p0]);
    const provenance = buildChokePointProvenance(candidate, CPO_CONCEPT, [...SEED_SOURCES, p0], "clean-equivalent");

    expect(provenance.candidateLevelP0.map((source) => source.id)).toContain("P0-300308-ANNUAL");
    expect(provenance.candidateLevelP0.every((source) => !isSerenityFrameworkSource(source))).toBe(true);
  });
});

describe("map status", () => {
  it("returns no-equivalent when a no-domestic-equivalent concept resolves nothing", () => {
    const concept: ChokePointConcept = { ...CPO_CONCEPT, chinaSubstituteStatus: "no-domestic-equivalent" };
    expect(decideMapStatus(concept, [])).toBe("no-equivalent");
  });

  it("returns unverifiable when a normal concept resolves nothing", () => {
    expect(decideMapStatus(CPO_CONCEPT, [])).toBe("unverifiable");
  });

  it("returns clean-equivalent when a theme-linked candidate resolves", () => {
    const candidate = scoreCandidate(OPTICAL, SEED_SOURCES);
    expect(decideMapStatus(CPO_CONCEPT, [candidate])).toBe("clean-equivalent");
  });

  it("returns domestic-substitution-play for a no-domestic-equivalent concept with candidates", () => {
    const concept: ChokePointConcept = { ...CPO_CONCEPT, chinaSubstituteStatus: "no-domestic-equivalent" };
    const candidate = scoreCandidate(OPTICAL, SEED_SOURCES);
    expect(decideMapStatus(concept, [candidate])).toBe("domestic-substitution-play");
  });
});

describe("theme extension", () => {
  it("returns null when the concept already maps to an existing theme", () => {
    expect(proposeThemeExtension(CPO_CONCEPT)).toBeNull();
  });

  it("proposes a new theme when no existing theme matches", () => {
    const orphan: ChokePointConcept = { ...CPO_CONCEPT, id: "novel-chokepoint", matchedThemeIds: [] };
    const theme = proposeThemeExtension(orphan);
    expect(theme).not.toBeNull();
    expect(theme?.id).toBe("theme-novel-chokepoint");
    expect(theme?.supportingConceptIds).toEqual(["novel-chokepoint"]);
  });
});

describe("geopolitics isolation", () => {
  it("surfaces geopolitics notes without ever touching the candidate score", () => {
    const serenityGeoSource: SourceRecord = {
      id: "SERENITY-GEO-NOTE-TEST",
      title: "Serenity 国产替代 CPO 硅光 note",
      tier: "P2",
      sourceType: "social",
      publisher: "Serenity / X",
      observedAt: "2026-06-01",
      summary: "国产替代 CPO 硅光 激光器 供应安全溢价线索。",
      evidenceTags: ["Serenity", "CPO", "硅光", "国产替代"],
    };
    const baseline = scoreCandidate(OPTICAL, SEED_SOURCES);
    const withGeo = scoreCandidate(OPTICAL, [...SEED_SOURCES, serenityGeoSource]);

    expect(withGeo.score).toBe(baseline.score);
    expect(geopoliticalNotes(CPO_CONCEPT).length).toBeGreaterThan(0);
  });
});
