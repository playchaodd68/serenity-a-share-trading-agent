import type { KillCriterion } from "../types.js";

// Pre-committed, dated, machine-checkable falsifiers written when a candidate enters
// observation. They operationalize the methodology's "可证伪路径" entry rule into ex-ante
// exit triggers so a thesis can be actively killed instead of quietly held.

const HORIZON_DAYS = {
  evidence: 30,
  negative: 60,
  valuation: 90,
  expectation: 90,
  supply: 120,
} as const;

export interface KillCriteriaInput {
  matchedThemeLabels: string[];
  hasCandidateP0: boolean;
  expectationGapScore: number;
  negativeHitSignals: string[];
  supplyReleaseTerms: string[];
  pe: number | null;
  entryDate: string;
}

export interface KillCandidateState {
  hasCandidateP0: boolean;
  activeNegativeSignals: string[];
}

export interface KillEvaluation {
  fired: KillCriterion[];
  overdue: KillCriterion[];
  pending: KillCriterion[];
  totalDelta: number;
}

const VALUATION_PE_THRESHOLD = 80;

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function buildKillCriteria(input: KillCriteriaInput): KillCriterion[] {
  const theme = input.matchedThemeLabels[0] ?? "该主线";
  const criteria: KillCriterion[] = [];

  if (!input.hasCandidateP0) {
    criteria.push({
      id: "kc-evidence-p0",
      category: "evidence-gap",
      trigger: `若 ${HORIZON_DAYS.evidence} 天内仍无候选级 P0（公告/年报/监管披露），视为证据无法补齐，退出观察。`,
      dueDate: addDays(input.entryDate, HORIZON_DAYS.evidence),
      sourceCheck: "CNINFO 公告/年报、互动易、投资者关系；ffd_announcements。",
      posteriorDelta: -15,
    });
  }

  // A stronger existing expectation-gap signal means less remaining downside if the
  // window fails to confirm, so soften the delta; a weak one keeps the full penalty.
  criteria.push({
    id: "kc-expectation-window",
    category: "expectation-window",
    trigger: `若 Q2/Q3/年度业绩未兑现订单、客户导入、放量或价格，${theme} 的兑现窗口证伪。`,
    dueDate: addDays(input.entryDate, HORIZON_DAYS.expectation),
    sourceCheck: "财报、业绩预告、ffd_financial_metrics、ffd_announcements。",
    posteriorDelta: input.expectationGapScore >= 8 ? -8 : -12,
  });

  criteria.push({
    id: "kc-supply-release",
    category: "supply-release",
    trigger: "若瓶颈环节出现大规模扩产、在建工程、定增募投或新进入者释放产能，瓶颈溶解，不再稀缺。",
    dueDate: addDays(input.entryDate, HORIZON_DAYS.supply),
    sourceCheck: "ffd_industry_indicator_data（capex/在建工程）、ffd_announcements（定增/发债/扩产）。",
    posteriorDelta: -10,
  });

  if (input.pe != null && input.pe >= VALUATION_PE_THRESHOLD) {
    criteria.push({
      id: "kc-valuation",
      category: "valuation",
      trigger: "若估值已透支且无新订单/价格/产能验证，交易兑现窗口关闭（产业正确≠交易正确）。",
      dueDate: addDays(input.entryDate, HORIZON_DAYS.valuation),
      sourceCheck: "ffd_index_valuation 估值分位、财报验证。",
      posteriorDelta: -8,
    });
  }

  input.negativeHitSignals.slice(0, 2).forEach((signal, index) => {
    criteria.push({
      id: `kc-negative-${index + 1}`,
      category: "negative-signal",
      trigger: `若产业证据确认「${signal}」，瓶颈不可替代性叙事被削弱。`,
      dueDate: addDays(input.entryDate, HORIZON_DAYS.negative),
      sourceCheck: "产业链访谈、卖方研报、客户/竞对公开材料。",
      posteriorDelta: -8,
      signal,
    });
  });

  return criteria.slice(0, 5);
}

export function evaluateKillCriteria(
  criteria: KillCriterion[],
  state: KillCandidateState,
  now: string,
): KillEvaluation {
  const fired: KillCriterion[] = [];
  const overdue: KillCriterion[] = [];
  const pending: KillCriterion[] = [];

  for (const criterion of criteria) {
    if (now < criterion.dueDate) {
      pending.push(criterion);
      continue;
    }
    if (criterion.category === "evidence-gap") {
      if (!state.hasCandidateP0) fired.push(criterion);
      // else: evidence arrived before the deadline — the falsifier is resolved, not fired.
      continue;
    }
    if (criterion.category === "negative-signal") {
      // Match on the discrete originating signal, not the rendered prose trigger.
      const stillActive = criterion.signal != null && state.activeNegativeSignals.includes(criterion.signal);
      if (stillActive) fired.push(criterion);
      continue;
    }
    // expectation-window / supply-release / valuation need external confirmation the
    // internal candidate state cannot supply; surface them as overdue for manual review.
    overdue.push(criterion);
  }

  const totalDelta = fired.reduce((sum, criterion) => sum + criterion.posteriorDelta, 0);
  return { fired, overdue, pending, totalDelta };
}
