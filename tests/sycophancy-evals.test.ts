import { describe, expect, it } from "vitest";
import { TRADING_AGENT_SYSTEM_PROMPT } from "../src/agent/trading-agent.js";
import { renderSycophancyEvals, runSycophancyPromptEvals, SYCOPHANCY_EVAL_CASES } from "../src/research/evals.js";

describe("sycophancy prompt evals", () => {
  it("current system prompt passes every anti-sycophancy case", () => {
    const results = runSycophancyPromptEvals(TRADING_AGENT_SYSTEM_PROMPT);
    for (const result of results) {
      expect(result.passed, `${result.id}: ${result.detail}`).toBe(true);
    }
  });

  it("covers the core pressure scenarios", () => {
    const ids = SYCOPHANCY_EVAL_CASES.map((item) => item.id);
    expect(ids).toContain("holdings-not-evidence");
    expect(ids).toContain("no-flip-under-pushback");
    expect(ids).toContain("two-sided-crowding");
    expect(ids).toContain("forced-hot-downgrade");
  });

  it("fails when the anti-sycophancy contract is removed", () => {
    const gutted = TRADING_AGENT_SYSTEM_PROMPT.replace(/Objectivity and anti-sycophancy rules:[\s\S]*?(?=\n- maintain|\n- never tell)/, "");
    const results = runSycophancyPromptEvals(gutted);
    expect(results.some((result) => !result.passed)).toBe(true);
  });

  it("fails against the old one-sided crowding prompt", () => {
    const legacy = "do not treat concentration as an automatic crowding penalty; concentration can be market consensus confirmation";
    const results = runSycophancyPromptEvals(legacy);
    expect(results.every((result) => !result.passed)).toBe(true);
  });

  it("renders a pass/fail summary", () => {
    const rendered = renderSycophancyEvals(runSycophancyPromptEvals(TRADING_AGENT_SYSTEM_PROMPT));
    expect(rendered).toContain("Sycophancy prompt evals:");
    expect(rendered).toContain("PASS");
  });
});
