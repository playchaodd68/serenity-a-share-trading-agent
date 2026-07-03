import type { EarningsExpress, EarningsPreannouncement } from "../connectors/eastmoney-earnings.js";
import type { SourceRecord } from "../types.js";

// 业绩预告/快报 → 确定性布尔事件 (提案 §2b-2 / §2c-1 / §2d)。
// 铁律: 本模块只产出布尔事件与确定性快照数据, 不产出任何评分/加权;
// "缺失 = 无信号", 绝不把缺失当负面。

/** 正面预告类型全集 (提案 §2d): 预增/预盈/扭亏。减亏/略增等不入正面事件。 */
export const POSITIVE_PREANNOUNCEMENT_TYPES = ["预增", "预盈", "扭亏"] as const;

/** PEAD 主兑现窗口 (事件驱动 B 组: 63 交易日为主兑现期, 提案 §2d)。 */
export const PEAD_WINDOW = "60-120交易日" as const;

export type EarningsEventKind =
  /** 业绩预告类型 ∈ {预增/预盈/扭亏}。 */
  | "forecast-positive"
  /** 业绩快报盈利且同比正增长或扭亏 (无一致预期基准时的确定性正面布尔)。 */
  | "express-positive"
  /** 业绩快报 ESP>0 (调用方提供一致预期基准时的三级复核升级形态)。 */
  | "express-beat";

export interface EarningsEvent {
  code: string;
  name: string;
  kind: EarningsEventKind;
  detail: string;
  /** 报告期末 YYYY-MM-DD。 */
  periodEnd: string;
  /** 公告日 YYYY-MM-DD (事件时钟的起点)。 */
  announceDate: string;
  window: typeof PEAD_WINDOW;
  /** 预告区间均值或快报实际值, 元; 仅披露增速区间时为 null (不倒算, §2b-2)。 */
  netProfit: number | null;
  /** ESP 值; 仅 express-beat 且提供预期基准时非 null。 */
  esp: number | null;
}

/**
 * 预告净利润区间取均值 (星火11: 区间均值偏差中位数 ≈5%)。
 * 仅披露增速区间 (两端均 null) 时返回 null —— 倒算净利润误差均值 27.7%, 明确跳过等快报 (§2b-2)。
 */
export function preannouncementForecastMean(item: EarningsPreannouncement): number | null {
  const { forecastNetProfitLow: low, forecastNetProfitHigh: high } = item;
  if (low != null && high != null) return (low + high) / 2;
  return low ?? high ?? null;
}

/**
 * ESP = (单季实际 − 单季预期) / |单季预期| (提案 §2c-1)。
 * 输入由调用方备好 (实际优先用预告区间均值/快报, 预期用一致预期分解到季)。
 * 预期为 0 或任一输入非有限数时返回 null (无法定义, 不伪造 0)。
 */
export function computeEsp(actualQuarterNet: number, expectedQuarterNet: number): number | null {
  if (!Number.isFinite(actualQuarterNet) || !Number.isFinite(expectedQuarterNet) || expectedQuarterNet === 0) return null;
  return (actualQuarterNet - expectedQuarterNet) / Math.abs(expectedQuarterNet);
}

/** ESP>0 即超预期布尔事件; null = 无信号 (不是 false 的负面, 是缺失)。 */
export function espBeat(esp: number | null): boolean {
  return esp != null && esp > 0;
}

// TODO(P1, 依赖 P0-5 快照库积累): 一致预期分解到季 —— expectedQuarterNet =
// 当年一致预期净利润 (consensus-snapshot 的 consensusNetProfitFY1) − 已披露累计净利润,
// 再按季节性权重切分到目标季。东财只有当前快照、无历史一致预期序列, 在快照库积累
// 6-12 个月前不臆造该分解; 本模块只保留 computeEsp 纯函数接口。
export interface QuarterExpectationInputs {
  /** 当年一致预期归母净利润, 元 (来自 consensus-snapshot FY1)。 */
  consensusNetProfitFY1: number;
  /** 年内已披露累计归母净利润, 元。 */
  disclosedCumulativeNetProfit: number;
}

export interface DeriveEarningsEventsOptions {
  /**
   * 可选: code → 与快报披露口径一致的预期净利润基准, 元 (由调用方分解备好, 见
   * QuarterExpectationInputs 的 TODO)。提供时 ESP 判定取代同比判定 (三级复核:
   * beat → express-beat, miss → 无正面事件即使同比为正)。
   */
  expectedNetProfitByCode?: ReadonlyMap<string, number>;
}

const PERIOD_SUFFIXES: Record<string, string> = { "03-31": "一季报", "06-30": "中报", "09-30": "三季报", "12-31": "年报" };

function periodLabel(periodEnd: string): string {
  const suffix = PERIOD_SUFFIXES[periodEnd.slice(5)];
  return suffix ? `${periodEnd.slice(0, 4)}${suffix}` : periodEnd;
}

function formatNetProfit(value: number): string {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿元`;
  return `${(value / 10_000).toFixed(0)}万元`;
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatRange(low: number | null, high: number | null, format: (value: number) => string): string {
  if (low != null && high != null) return low === high ? format(low) : `${format(low)}~${format(high)}`;
  const single = low ?? high;
  return single != null ? format(single) : "";
}

/** 同一 code+periodEnd 的多次披露 (修正公告/更新) 只保留最新公告日那份。 */
function latestByCodeAndPeriod<T extends { code: string; periodEnd: string; announceDate: string }>(items: T[]): T[] {
  const latest = new Map<string, T>();
  for (const item of items) {
    const key = `${item.code}|${item.periodEnd}`;
    const existing = latest.get(key);
    if (!existing || item.announceDate > existing.announceDate) latest.set(key, item);
  }
  return [...latest.values()];
}

function forecastDetail(item: EarningsPreannouncement, mean: number | null): string {
  const period = periodLabel(item.periodEnd);
  const pctRange = formatRange(item.changePctLow, item.changePctHigh, formatPct);
  if (mean == null) {
    const pctText = pctRange ? `（${pctRange}）` : "";
    return `${period}业绩预告「${item.type}」：仅披露增速区间${pctText}，不倒算净利润（误差均值27.7%），待业绩快报复核`;
  }
  const amountRange = formatRange(item.forecastNetProfitLow, item.forecastNetProfitHigh, formatNetProfit);
  const pctText = pctRange ? `，同比 ${pctRange}` : "";
  return `${period}业绩预告「${item.type}」：归母净利润 ${amountRange}（区间均值 ${formatNetProfit(mean)}）${pctText}`;
}

function deriveForecastEvents(preannouncements: EarningsPreannouncement[]): EarningsEvent[] {
  return latestByCodeAndPeriod(preannouncements)
    .filter((item) => (POSITIVE_PREANNOUNCEMENT_TYPES as readonly string[]).includes(item.type))
    .map((item) => {
      const mean = preannouncementForecastMean(item);
      return {
        code: item.code,
        name: item.name,
        kind: "forecast-positive" as const,
        detail: forecastDetail(item, mean),
        periodEnd: item.periodEnd,
        announceDate: item.announceDate,
        window: PEAD_WINDOW,
        netProfit: mean,
        esp: null,
      };
    });
}

function deriveExpressEvent(item: EarningsExpress, expected: number | undefined): EarningsEvent | null {
  if (item.netProfit == null) return null;
  const period = periodLabel(item.periodEnd);
  if (expected != null) {
    // 三级复核: 有一致预期基准时, ESP 判定取代同比判定 (miss 不再降级回同比口径)。
    const esp = computeEsp(item.netProfit, expected);
    if (!espBeat(esp)) return null;
    return {
      code: item.code,
      name: item.name,
      kind: "express-beat",
      detail: `${period}业绩快报：归母净利润 ${formatNetProfit(item.netProfit)}，超一致预期基准 ${formatNetProfit(expected)}（ESP ${(esp as number).toFixed(4)}）`,
      periodEnd: item.periodEnd,
      announceDate: item.announceDate,
      window: PEAD_WINDOW,
      netProfit: item.netProfit,
      esp,
    };
  }
  // 无预期基准: 正面布尔 = 盈利 且 (同比正增长 或 去年同期亏损即扭亏)。
  // 净利为负而 JLRTBZCL 为正的亏损收窄不入正面事件, 对齐预告侧 {预增/预盈/扭亏} 的保守口径。
  const turnaround = item.prevYearSamePeriodNetProfit != null && item.prevYearSamePeriodNetProfit < 0;
  const growing = item.netProfitYoyPct != null && item.netProfitYoyPct > 0;
  if (item.netProfit <= 0 || (!growing && !turnaround)) return null;
  const yoyText = item.netProfitYoyPct != null ? `，同比 ${formatPct(item.netProfitYoyPct)}` : turnaround ? "，去年同期亏损（扭亏）" : "";
  return {
    code: item.code,
    name: item.name,
    kind: "express-positive",
    detail: `${period}业绩快报：归母净利润 ${formatNetProfit(item.netProfit)}${yoyText}`,
    periodEnd: item.periodEnd,
    announceDate: item.announceDate,
    window: PEAD_WINDOW,
    netProfit: item.netProfit,
    esp: null,
  };
}

/**
 * 业绩预告/快报 → 确定性布尔事件清单。
 * - 预告: 类型 ∈ {预增/预盈/扭亏} 即正面事件; 仅披露增速区间不倒算净利润 (§2b-2)。
 * - 快报: 无预期基准时取"盈利且同比正增长/扭亏"; 提供基准时按 ESP 三级复核升级为 express-beat。
 * 输出按公告日倒序、代码升序, 完全确定性。
 */
export function deriveEarningsEvents(
  preannouncements: EarningsPreannouncement[],
  expresses: EarningsExpress[],
  options: DeriveEarningsEventsOptions = {},
): EarningsEvent[] {
  const forecastEvents = deriveForecastEvents(preannouncements);
  const expressEvents = latestByCodeAndPeriod(expresses)
    .map((item) => deriveExpressEvent(item, options.expectedNetProfitByCode?.get(item.code)))
    .filter((event): event is EarningsEvent => event != null);
  return [...forecastEvents, ...expressEvents].sort(
    (left, right) => right.announceDate.localeCompare(left.announceDate) || left.code.localeCompare(right.code),
  );
}

const KIND_TITLES: Record<EarningsEventKind, string> = {
  "forecast-positive": "业绩预告正面事件",
  "express-positive": "业绩快报正增长",
  "express-beat": "业绩快报超预期",
};

function eventUrl(event: EarningsEvent): string {
  return event.kind === "forecast-positive"
    ? `https://data.eastmoney.com/bbsj/yjyg/${event.code}.html`
    : `https://data.eastmoney.com/bbsj/yjkb/${event.code}.html`;
}

/**
 * 把布尔事件转成项目 SourceRecord 结构 (tier=P0, 法定披露), 供 screener 侧的
 * extractCandidateEvidence 消费: 标题/标签含 code+name → 对应候选判 direct、
 * primary-filing; "candidate-direct" 标签保证不会泄漏为其它候选的间接证据。
 * 消费接线由主会话完成; 本函数只保证结构正确。
 */
export function toEvidenceRecords(events: EarningsEvent[]): SourceRecord[] {
  return events.map((event) => ({
    id: `P0-EM-EARN-${event.code}-${event.periodEnd.replaceAll("-", "")}-${event.kind}`,
    title: `${event.code} ${event.name} ${periodLabel(event.periodEnd)}${KIND_TITLES[event.kind]}`,
    tier: "P0",
    sourceType: "primary",
    publisher: "交易所法定披露（东方财富数据中心转载）",
    observedAt: event.announceDate,
    url: eventUrl(event),
    summary: `${event.name}（${event.code}）${event.detail}。法定披露业绩事件，兑现窗口 ${event.window}。`,
    evidenceTags: [
      event.code,
      event.name,
      "candidate-direct",
      "earnings-disclosure",
      "announcement",
      event.kind,
      event.periodEnd,
    ],
  }));
}
