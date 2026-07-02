import { describe, expect, it } from "vitest";
import {
  createDebateState,
  recordTurn,
  shouldContinueDebate,
  visibleOpponentArguments,
} from "../src/research/debate/debate-state.js";

describe("debate state machine", () => {
  it("terminates by counter (2 * maxRounds)", () => {
    let state = createDebateState();
    expect(shouldContinueDebate(state, 1)).toBe(true);
    state = recordTurn(state, "bear", "空头论点");
    state = recordTurn(state, "bull", "多头回应");
    expect(state.count).toBe(2);
    expect(shouldContinueDebate(state, 1)).toBe(false);
    expect(shouldContinueDebate(state, 2)).toBe(true);
  });

  it("records turns immutably into side histories", () => {
    const initial = createDebateState();
    const after = recordTurn(initial, "bear", "第一条空头论点");
    expect(initial.count).toBe(0);
    expect(initial.bearHistory).toHaveLength(0);
    expect(after.bearHistory).toEqual(["第一条空头论点"]);
    expect(after.bullHistory).toHaveLength(0);
    expect(after.history[0]).toContain("[bear]");
    expect(after.currentResponse).toBe("第一条空头论点");
  });

  it("keeps the first bear round blind to bull arguments", () => {
    let state = createDebateState();
    state = recordTurn(state, "bull", "多头先说了一个论点");
    expect(visibleOpponentArguments(state, "bear", 1)).toEqual([]);
    expect(visibleOpponentArguments(state, "bear", 2)).toEqual(["多头先说了一个论点"]);
  });
});
