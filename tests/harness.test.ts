import { describe, expect, it } from "vitest";
import { runHarness } from "../src/harness/run.js";

describe("deterministic harness", () => {
  it("passes all checks", async () => {
    const result = await runHarness();
    expect(result.ok).toBe(true);
  });
});
