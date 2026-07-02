import { describe, expect, it } from "vitest";
import {
  applyRatingConstraint,
  computeRatingConstraint,
  confidenceFromScore,
  minConfidence,
} from "../src/scoring/rating-constraints.js";

const CLEAN = {
  hasCandidateP0: true,
  hasIndependentCorroboration: true,
  disqualifierTriggered: false,
  reflexivityFlag: false,
};

describe("rating constraints", () => {
  it("allows high confidence only with full evidence and no vetoes", () => {
    const constraint = computeRatingConstraint(CLEAN);
    expect(constraint.ceiling).toBe("high");
    expect(constraint.reasons).toEqual([]);
  });

  it("caps at medium without candidate-level P0", () => {
    const constraint = computeRatingConstraint({ ...CLEAN, hasCandidateP0: false });
    expect(constraint.ceiling).toBe("medium");
    expect(constraint.reasons.join("\n")).toContain("P0");
  });

  it("caps at medium without independent corroboration", () => {
    const constraint = computeRatingConstraint({ ...CLEAN, hasIndependentCorroboration: false });
    expect(constraint.ceiling).toBe("medium");
  });

  it("caps at medium on reflexivity flag even with strong evidence", () => {
    const constraint = computeRatingConstraint({ ...CLEAN, reflexivityFlag: true });
    expect(constraint.ceiling).toBe("medium");
    expect(constraint.reasons.join("\n")).toContain("反身性");
  });

  it("disqualifier is a hard veto to low regardless of everything else", () => {
    const constraint = computeRatingConstraint({ ...CLEAN, disqualifierTriggered: true });
    expect(constraint.ceiling).toBe("low");
    expect(constraint.reasons.join("\n")).toContain("一票否决");
  });

  it("blocks high when a bear pass is required but not completed", () => {
    const constraint = computeRatingConstraint({ ...CLEAN, bearCaseCompleted: false });
    expect(constraint.ceiling).toBe("medium");
    expect(constraint.reasons.join("\n")).toContain("反方");
  });

  it("does not require a bear pass when the engine is not wired (undefined)", () => {
    const constraint = computeRatingConstraint({ ...CLEAN, bearCaseCompleted: undefined });
    expect(constraint.ceiling).toBe("high");
  });

  it("applyRatingConstraint takes the minimum of base and ceiling", () => {
    const constraint = computeRatingConstraint({ ...CLEAN, hasCandidateP0: false });
    expect(applyRatingConstraint("high", constraint)).toBe("medium");
    expect(applyRatingConstraint("low", constraint)).toBe("low");
  });

  it("confidenceFromScore keeps existing 45/70 thresholds", () => {
    expect(confidenceFromScore(70)).toBe("high");
    expect(confidenceFromScore(69.9)).toBe("medium");
    expect(confidenceFromScore(45)).toBe("medium");
    expect(confidenceFromScore(44.9)).toBe("low");
  });

  it("minConfidence orders low < medium < high", () => {
    expect(minConfidence("high", "medium")).toBe("medium");
    expect(minConfidence("low", "high")).toBe("low");
  });
});
