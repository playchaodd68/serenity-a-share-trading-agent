// Counter-terminated debate state (ported pattern: TradingAgents InvestDebateState).
// Protocol difference on purpose: the FIRST bear round is blind — it receives only the
// evidence pack, never the bull thesis — so the bear pass cannot be anchored by bull
// narrative (fixes the rebuttal-style anchoring flaw in TradingAgents-CN).

export interface DebateState {
  history: string[];
  bullHistory: string[];
  bearHistory: string[];
  currentResponse: string;
  count: number;
}

export const DEFAULT_MAX_DEBATE_ROUNDS = 1;

export function createDebateState(): DebateState {
  return { history: [], bullHistory: [], bearHistory: [], currentResponse: "", count: 0 };
}

export function shouldContinueDebate(state: DebateState, maxRounds = DEFAULT_MAX_DEBATE_ROUNDS): boolean {
  return state.count < 2 * maxRounds;
}

export function recordTurn(state: DebateState, side: "bull" | "bear", content: string): DebateState {
  const entry = `[${side}] ${content}`;
  return {
    history: [...state.history, entry],
    bullHistory: side === "bull" ? [...state.bullHistory, content] : state.bullHistory,
    bearHistory: side === "bear" ? [...state.bearHistory, content] : state.bearHistory,
    currentResponse: content,
    count: state.count + 1,
  };
}

// The bear side may only see opposing arguments from the second round onward.
export function visibleOpponentArguments(state: DebateState, side: "bull" | "bear", round: number): string[] {
  if (side === "bear" && round <= 1) return [];
  return side === "bear" ? state.bullHistory : state.bearHistory;
}
