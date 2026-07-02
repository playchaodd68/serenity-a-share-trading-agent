import { describe, expect, it } from "vitest";
import {
  createRng,
  initialArms,
  pickNextTheme,
  sampleAllocation,
  updateArm,
} from "../src/research/direction-bandit.js";
import type { ThemeArmState } from "../src/research/direction-bandit.js";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it("produces values in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe("initialArms", () => {
  it("starts every arm at the uniform prior Beta(1,1)", () => {
    const arms = initialArms(["ai", "solar", "pharma"]);
    expect(arms).toEqual([
      { themeId: "ai", alpha: 1, beta: 1 },
      { themeId: "solar", alpha: 1, beta: 1 },
      { themeId: "pharma", alpha: 1, beta: 1 },
    ]);
  });
});

describe("updateArm", () => {
  it("increments alpha on outcome=1 and beta on outcome=0", () => {
    const arms = initialArms(["ai", "solar"]);
    const won = updateArm(arms, "ai", 1);
    expect(won.find((arm) => arm.themeId === "ai")).toEqual({ themeId: "ai", alpha: 2, beta: 1 });
    const lost = updateArm(won, "ai", 0);
    expect(lost.find((arm) => arm.themeId === "ai")).toEqual({ themeId: "ai", alpha: 2, beta: 2 });
    expect(lost.find((arm) => arm.themeId === "solar")).toEqual({ themeId: "solar", alpha: 1, beta: 1 });
  });

  it("does not mutate the input arms", () => {
    const arms = initialArms(["ai", "solar"]);
    const snapshot = JSON.parse(JSON.stringify(arms)) as ThemeArmState[];
    const updated = updateArm(arms, "ai", 1);
    expect(arms).toEqual(snapshot);
    expect(updated).not.toBe(arms);
    expect(updated.find((arm) => arm.themeId === "ai")).not.toBe(arms.find((arm) => arm.themeId === "ai"));
  });

  it("returns arms unchanged for an unknown themeId", () => {
    const arms = initialArms(["ai"]);
    const updated = updateArm(arms, "nonexistent", 1);
    expect(updated).toEqual(arms);
  });
});

describe("sampleAllocation", () => {
  it("returns one allocation per arm, sorted by sampledValue descending", () => {
    const arms = initialArms(["ai", "solar", "pharma"]);
    const rng = createRng(99);
    const allocation = sampleAllocation(arms, rng);
    expect(allocation).toHaveLength(3);
    expect(new Set(allocation.map((item) => item.themeId))).toEqual(new Set(["ai", "solar", "pharma"]));
    for (let i = 1; i < allocation.length; i += 1) {
      expect(allocation[i - 1].sampledValue).toBeGreaterThanOrEqual(allocation[i].sampledValue);
    }
    for (const item of allocation) {
      expect(item.sampledValue).toBeGreaterThan(0);
      expect(item.sampledValue).toBeLessThan(1);
    }
  });
});

describe("pickNextTheme", () => {
  it("returns a valid themeId deterministically under a fixed seed", () => {
    const arms = initialArms(["ai", "solar", "pharma"]);
    const first = pickNextTheme(arms, createRng(123));
    const second = pickNextTheme(arms, createRng(123));
    expect(["ai", "solar", "pharma"]).toContain(first);
    expect(first).toBe(second);
  });

  it("throws on an empty arm list", () => {
    expect(() => pickNextTheme([], createRng(1))).toThrow();
  });

  it("prefers an arm with 20 wins over an all-losing arm in over 60% of 200 draws", () => {
    let arms = initialArms(["winner", "loser"]);
    for (let i = 0; i < 20; i += 1) {
      arms = updateArm(arms, "winner", 1);
      arms = updateArm(arms, "loser", 0);
    }
    const rng = createRng(2026);
    let winnerPicks = 0;
    for (let i = 0; i < 200; i += 1) {
      if (pickNextTheme(arms, rng) === "winner") {
        winnerPicks += 1;
      }
    }
    expect(winnerPicks).toBeGreaterThan(120);
  });

  it("still explores a cold all-losing arm at least once in 500 draws", () => {
    let arms = initialArms(["hot", "cold"]);
    for (let i = 0; i < 3; i += 1) {
      arms = updateArm(arms, "hot", 1);
      arms = updateArm(arms, "cold", 0);
    }
    const rng = createRng(7);
    let coldPicks = 0;
    for (let i = 0; i < 500; i += 1) {
      if (pickNextTheme(arms, rng) === "cold") {
        coldPicks += 1;
      }
    }
    expect(coldPicks).toBeGreaterThanOrEqual(1);
    // 探索保底不等于均分：冷门臂只应占少数。
    expect(coldPicks).toBeLessThan(250);
  });
});
