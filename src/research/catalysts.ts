import type { CandidateResolution, CatalystCriterion } from "../types.js";

// Dated catalyst ledger (N3) — the positive mirror of kill-criteria. Registered when a
// candidate enters observation; a catalyst that expires unconfirmed lowers the
// posterior instead of being quietly forgotten. Resolution-side helper (N4) classifies
// a validated outcome as fundamental-confirmed vs unconfirmed rise so reflexivity/beta
// gains never masquerade as thesis confirmation in the calibration data.

const HORIZON_DAYS = {
  earnings: 90,
  certification: 60,
  pricing: 60,
  capacity: 120,
} as const;

export interface CatalystInput {
  matchedThemeLabels: string[];
  expectationGapScore: number;
  entryDate: string;
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function buildCatalysts(input: CatalystInput): CatalystCriterion[] {
  const theme = input.matchedThemeLabels[0] ?? "该主线";
  const weakExpectation = input.expectationGapScore < 8;
  return [
    {
      id: "cat-earnings",
      category: "earnings",
      trigger: `Q2/Q3/年度业绩兑现订单、放量或价格，验证 ${theme} 的兑现窗口。`,
      dueDate: addDays(input.entryDate, HORIZON_DAYS.earnings),
      sourceCheck: "财报、业绩预告、ffd_financial_metrics、ffd_announcements。",
      posteriorDelta: weakExpectation ? -10 : -6,
      confirms: "业绩/订单落地，thesis 获得基本面确认。",
    },
    {
      id: "cat-certification",
      category: "certification",
      trigger: "客户认证通过、design-win 公告或投资者关系确认导入。",
      dueDate: addDays(input.entryDate, HORIZON_DAYS.certification),
      sourceCheck: "公司公告、互动易/投资者关系、客户公开材料。",
      posteriorDelta: -6,
      confirms: "客户验证落地，卡点位置被下游承认。",
    },
    {
      id: "cat-pricing",
      category: "pricing",
      trigger: "环节价格/单价上行或紧缺信号被独立渠道证实。",
      dueDate: addDays(input.entryDate, HORIZON_DAYS.pricing),
      sourceCheck: "行业价格指标（ffd_industry_indicator_data）、产业链调研、卖方数据。",
      posteriorDelta: -5,
      confirms: "价格信号确认供需缺口存在。",
    },
    {
      id: "cat-capacity",
      category: "capacity",
      trigger: "产能爬坡/投产进度兑现且未出现同环节大规模竞争扩产。",
      dueDate: addDays(input.entryDate, HORIZON_DAYS.capacity),
      sourceCheck: "在建工程/公告、环评能评备案、产业调研。",
      posteriorDelta: -5,
      confirms: "供给节奏可控，瓶颈耐久度维持。",
    },
  ];
}

export interface CatalystEvaluation {
  confirmedNeeded: CatalystCriterion[];
  pending: CatalystCriterion[];
  due: CatalystCriterion[];
  totalOverdueDelta: number;
}

// confirmedIds: catalysts the researcher has explicitly marked as confirmed (manual or
// tool-verified). Anything past due and unconfirmed contributes its posteriorDelta.
export function evaluateCatalysts(criteria: CatalystCriterion[], confirmedIds: Set<string>, now: string): CatalystEvaluation {
  const pending: CatalystCriterion[] = [];
  const due: CatalystCriterion[] = [];
  for (const criterion of criteria) {
    if (confirmedIds.has(criterion.id)) continue;
    if (now < criterion.dueDate) pending.push(criterion);
    else due.push(criterion);
  }
  return {
    confirmedNeeded: criteria.filter((criterion) => !confirmedIds.has(criterion.id)),
    pending,
    due,
    totalOverdueDelta: due.reduce((sum, criterion) => sum + criterion.posteriorDelta, 0),
  };
}

export type ResolutionConfirmation = "fundamental-confirmed" | "unconfirmed-rise" | "not-applicable";

export function classifyResolutionConfirmation(
  outcomeLabel: CandidateResolution["outcomeLabel"],
  confirmedCatalystCount: number,
): ResolutionConfirmation {
  if (outcomeLabel !== "validated") return "not-applicable";
  return confirmedCatalystCount > 0 ? "fundamental-confirmed" : "unconfirmed-rise";
}

export function renderCatalysts(criteria: CatalystCriterion[]): string {
  if (criteria.length === 0) return "- 无已登记催化剂。";
  return criteria
    .map(
      (criterion) =>
        `- [${criterion.category}] ${criterion.trigger}（${criterion.dueDate.slice(0, 10)} 前核验：${criterion.sourceCheck}；到期未兑现 ${criterion.posteriorDelta} 分）`,
    )
    .join("\n");
}
