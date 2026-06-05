import type {
  Candidate,
  QuantCandidateBucket,
  QuantCandidateOverlay,
  QuantEvidenceGate,
  QuantIndustryScore,
  QuantIndustryTier,
  QuantRiskMode,
  QuantScoreComponent,
  QuantScreenSummary,
} from "../types.js";

export const SERENITY_QUANT_STRATEGY = "Serenity Mainline Quant Overlay" as const;

const NO_CROWDING_NOTE = "成交集中、机构抱团、换手抬升不作为拥挤降权；只有趋势破坏、证据削弱或交易不可执行才降权。";

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function avg(values: number[]): number {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function scale(value: number, sourceMax: number, targetMax: number): number {
  if (sourceMax <= 0) return 0;
  return clamp((value / sourceMax) * targetMax, 0, targetMax);
}

function component(name: string, score: number, maxScore: number, reason: string, sourceIds: string[], kind: QuantScoreComponent["kind"] = "positive"): QuantScoreComponent {
  return {
    name,
    score: Number(score.toFixed(2)),
    maxScore,
    reason,
    sourceIds: [...new Set(sourceIds)].slice(0, 12),
    kind,
  };
}

function componentSourceIds(candidates: Candidate[]): string[] {
  return [
    ...new Set(
      candidates.flatMap((candidate) => [
        ...candidate.trace.components.flatMap((item) => item.sourceIds),
        ...(candidate.trace.structuredEvidence ?? []).map((item) => item.sourceId),
      ]),
    ),
  ].slice(0, 12);
}

function candidateSourceIds(candidate: Candidate): string[] {
  return [
    ...new Set([
      ...candidate.trace.components.flatMap((item) => item.sourceIds),
      ...(candidate.trace.structuredEvidence ?? []).map((item) => item.sourceId),
    ]),
  ].slice(0, 12);
}

function industryKeyFor(candidate: Candidate): string {
  return candidate.stock.industry || candidate.matchedThemes[0]?.label || "未分类产业链";
}

function industryTier(score: number): QuantIndustryTier {
  if (score >= 70) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  return "Reject";
}

function bucketRank(bucket: QuantCandidateBucket): number {
  switch (bucket) {
    case "core":
      return 0;
    case "watchlist":
      return 1;
    case "observe":
      return 2;
    case "reject":
      return 3;
  }
}

function marketConfirmationScore(candidate: Candidate): number {
  return candidate.trace.components.find((item) => item.name === "market-confirmation")?.score ?? 0;
}

function sourceQualityScore(candidate: Candidate): number {
  return candidate.trace.components.find((item) => item.name === "source-quality")?.score ?? 0;
}

function hasCandidateP0(candidate: Candidate): boolean {
  return Boolean(candidate.trace.structuredEvidence?.some((item) => item.tier === "P0" && item.direct));
}

function hasStrongP1(candidate: Candidate): boolean {
  return Boolean(candidate.trace.structuredEvidence?.some((item) => item.tier === "P1" && item.confidence >= 0.55));
}

function hasIndependentCorroboration(candidate: Candidate): boolean {
  return Boolean(candidate.trace.structuredEvidence?.some((item) => item.tier !== "P0" && (item.direct || item.kind === "market-signal" || item.kind === "broker-report")));
}

function directEvidenceCount(candidate: Candidate): number {
  return candidate.trace.structuredEvidence?.filter((item) => item.direct).length ?? 0;
}

function riskEvidenceCount(candidate: Candidate): number {
  return candidate.trace.structuredEvidence?.filter((item) => item.kind === "risk" || item.polarity === "negative").length ?? 0;
}

function evidenceGate(candidate: Candidate): QuantEvidenceGate {
  if (hasCandidateP0(candidate) && hasIndependentCorroboration(candidate)) return "pass";
  if (hasCandidateP0(candidate) || hasStrongP1(candidate) || candidate.confidence === "medium" || candidate.confidence === "high") return "watchlist";
  return "fail";
}

function scoreIndustry(industryKey: string, candidates: Candidate[]): QuantIndustryScore {
  const sourceIds = componentSourceIds(candidates);
  const logicScores = candidates.map((candidate) => candidate.trace.industryLogic?.totalScore ?? candidate.trace.priorScore);
  const industryPrior = scale(avg(logicScores), 72, 35);

  const positivePctRatio = candidates.filter((candidate) => (candidate.stock.pctChange ?? 0) > 0).length / Math.max(candidates.length, 1);
  const avgPct = avg(candidates.map((candidate) => candidate.stock.pctChange ?? 0));
  const avgMarket = avg(candidates.map(marketConfirmationScore));
  const trendScore = clamp(positivePctRatio * 8 + Math.max(avgPct, 0) * 1.4 + scale(avgMarket, 5, 6), 0, 22);

  const boomScore = clamp(
    scale(avg(candidates.map((candidate) => candidate.trace.industryLogic?.supplyDemandProfitScore ?? 0)), 15, 9) +
      scale(avg(candidates.map((candidate) => candidate.trace.industryLogic?.expectationGapScore ?? 0)), 12, 9),
    0,
    18,
  );

  const uniqueThemes = new Set(candidates.flatMap((candidate) => candidate.matchedThemes.map((theme) => theme.themeId)));
  const breadthScore = clamp((Math.log(candidates.length + 1) / Math.log(8)) * 8 + Math.min(uniqueThemes.size, 4) + positivePctRatio * 3, 0, 15);

  const moneyPositiveRatio = candidates.filter((candidate) => (candidate.stock.mainNetInflow ?? 0) > 0).length / Math.max(candidates.length, 1);
  const avgTurnover = avg(candidates.map((candidate) => candidate.stock.turnover ?? 0));
  const moneyScore = clamp(moneyPositiveRatio * 5 + Math.min(avgTurnover, 5), 0, 10);

  const reportEvidenceRatio = candidates.filter((candidate) => hasStrongP1(candidate) || (candidate.trace.structuredEvidence ?? []).some((item) => item.kind === "broker-report")).length / Math.max(candidates.length, 1);
  const analystScore = clamp(reportEvidenceRatio * 5, 0, 5);

  const evidenceGapRatio = avg(candidates.map((candidate) => Math.min(candidate.trace.coverageGaps.length, 6))) / 6;
  const evidencePenalty = clamp(evidenceGapRatio * 10, 0, 10);

  const components = [
    component("serenity-industry-prior", industryPrior, 35, `行业内候选的产业链瓶颈后验均值为 ${avg(logicScores).toFixed(1)}。`, sourceIds),
    component("industry-trend-ir-proxy", trendScore, 22, `用候选涨跌、市场确认分和正收益占比近似当前趋势确认；正收益占比 ${(positivePctRatio * 100).toFixed(0)}%。`, ["EASTMONEY-A-SHARE-SNAPSHOT"]),
    component("fundamental-boom-proxy", boomScore, 18, "用供需利润弹性和验证窗口分近似行业景气，等待财报/FFD 行业指标替换。", sourceIds),
    component("breadth-expansion", breadthScore, 15, `行业内候选 ${candidates.length} 只，覆盖 ${uniqueThemes.size} 条 Serenity 主题线索。`, sourceIds),
    component("main-money-confirmation", moneyScore, 10, `主力净流入正向占比 ${(moneyPositiveRatio * 100).toFixed(0)}%，平均换手 ${avgTurnover.toFixed(2)}%。`, ["EASTMONEY-A-SHARE-SNAPSHOT"]),
    component("analyst-or-report-revision", analystScore, 5, `P1/研报类验证候选占比 ${(reportEvidenceRatio * 100).toFixed(0)}%。`, sourceIds),
    component("evidence-gap-penalty", -evidencePenalty, 0, "覆盖缺口只惩罚证据不足，不惩罚成交或持仓集中。", sourceIds, "penalty"),
  ];

  const score = clamp(components.reduce((sum, item) => sum + item.score, 0), 0, 100);
  return {
    industryKey,
    score: Number(score.toFixed(2)),
    tier: industryTier(score),
    components,
    notes: [NO_CROWDING_NOTE, "行业拥挤度指标仅作为交易结构观察项，不进入主线扣分。"],
  };
}

function scoreFundamentalVerification(candidate: Candidate): QuantScoreComponent {
  const logic = candidate.trace.industryLogic;
  const score = clamp(scale(logic?.supplyDemandProfitScore ?? 0, 15, 7) + scale(logic?.expectationGapScore ?? 0, 12, 5) + Math.min(directEvidenceCount(candidate), 3), 0, 15);
  return component("fundamental-verification", score, 15, logic?.validationWindow ?? "缺少产业验证窗口，先保留为观察。", candidateSourceIds(candidate));
}

function scoreQualitySafety(candidate: Candidate): QuantScoreComponent {
  let score = 0;
  const reasons: string[] = [];
  if (candidate.stock.pe != null && candidate.stock.pe > 0) {
    score += 2.5;
    reasons.push(`PE 为 ${candidate.stock.pe.toFixed(1)} 且非负`);
  } else if (candidate.stock.pe == null) {
    score += 1;
    reasons.push("PE 缺失，质量分保守处理");
  } else {
    reasons.push("PE 为负，等待盈利质量核验");
  }
  if ((candidate.stock.totalMarketCap ?? 0) > 5_000_000_000) {
    score += 1.5;
    reasons.push("市值规模满足基础可跟踪性");
  }
  score += scale(sourceQualityScore(candidate), 15, 4);
  if (hasCandidateP0(candidate)) score += 2;
  if (hasIndependentCorroboration(candidate)) score += 2;
  return component("quality-safety", clamp(score, 0, 12), 12, reasons.join("; ") || "质量安全数据不足，等待 P0/P1 补齐。", candidateSourceIds(candidate));
}

function scoreRelativeTrend(candidate: Candidate, industry: QuantIndustryScore): QuantScoreComponent {
  const pct = candidate.stock.pctChange ?? 0;
  const turnover = candidate.stock.turnover ?? 0;
  const score = clamp((pct > 0 ? Math.min(pct, 6) * 0.6 : 0) + Math.min(turnover, 5) * 0.6 + scale(marketConfirmationScore(candidate), 5, 3) + (industry.tier === "A" ? 2 : industry.tier === "B" ? 1 : 0), 0, 12);
  return component("relative-trend", score, 12, `当前涨跌幅 ${pct.toFixed(2)}%，换手 ${turnover.toFixed(2)}%，行业分层 ${industry.tier}。`, ["EASTMONEY-A-SHARE-SNAPSHOT"]);
}

function scoreVolumePrice(candidate: Candidate): QuantScoreComponent {
  const pct = candidate.stock.pctChange ?? 0;
  const turnover = candidate.stock.turnover ?? 0;
  const mainInflow = candidate.stock.mainNetInflow ?? 0;
  const score = clamp((mainInflow > 0 ? 3 : 0) + (pct > 0 ? 2 : 0) + Math.min(turnover, 5) * 0.5 + scale(marketConfirmationScore(candidate), 5, 0.5), 0, 8);
  const reason = [
    mainInflow > 0 ? "主力净流入为正" : "主力净流入未确认",
    pct > 0 ? "价格正反馈" : "价格尚未确认",
    `换手 ${turnover.toFixed(2)}% 只作流动性观察，不作拥挤惩罚`,
  ].join("; ");
  return component("volume-price-confirmation", score, 8, reason, ["EASTMONEY-A-SHARE-SNAPSHOT"]);
}

function scoreValuation(candidate: Candidate): QuantScoreComponent {
  const pe = candidate.stock.pe;
  let score = 2;
  let reason = "PE 缺失，估值纪律中性处理。";
  if (pe != null && pe > 0 && pe <= 80) {
    score = 5;
    reason = `PE ${pe.toFixed(1)}，估值未明显脱离当前验证。`;
  } else if (pe != null && pe > 80 && pe <= 160) {
    score = (candidate.trace.industryLogic?.expectationGapScore ?? 0) >= 6 ? 4 : 2.5;
    reason = `PE ${pe.toFixed(1)} 偏高，必须依赖订单、价格、产能或业绩验证。`;
  } else if (pe != null && pe <= 0) {
    score = 0;
    reason = `PE ${pe.toFixed(1)} 为负，盈利质量需额外核验。`;
  }
  return component("valuation-discipline", score, 5, reason, ["EASTMONEY-A-SHARE-SNAPSHOT"]);
}

function scoreLiquidity(candidate: Candidate): QuantScoreComponent {
  const totalCap = candidate.stock.totalMarketCap ?? 0;
  const floatCap = candidate.stock.floatMarketCap ?? 0;
  const score = clamp((totalCap > 5_000_000_000 ? 1 : 0) + (floatCap > 2_000_000_000 ? 1 : 0) + (candidate.stock.latestPrice != null ? 0.5 : 0) + (candidate.stock.turnover != null ? 0.5 : 0), 0, 3);
  return component("liquidity-capacity", score, 3, `总市值 ${(totalCap / 1_000_000_000).toFixed(1)}B，流通市值 ${(floatCap / 1_000_000_000).toFixed(1)}B。`, ["EASTMONEY-A-SHARE-SNAPSHOT"]);
}

function thunderstormPenalty(candidate: Candidate): QuantScoreComponent {
  let penalty = 0;
  const reasons: string[] = [];
  if (/ST|\*|退/.test(candidate.stock.name)) {
    penalty += 20;
    reasons.push("名称含 ST/*/退，直接触发财务/退市风险");
  }
  if (candidate.stock.pe != null && candidate.stock.pe < 0) {
    penalty += 6;
    reasons.push("PE 为负");
  }
  const riskCount = riskEvidenceCount(candidate);
  if (riskCount > 0) {
    penalty += Math.min(riskCount * 3, 8);
    reasons.push(`存在 ${riskCount} 条负面或风险证据`);
  }
  if (candidate.stock.totalMarketCap == null) {
    penalty += 2;
    reasons.push("市值缺失");
  }
  return component("thunderstorm-risk-penalty", -clamp(penalty, 0, 20), 0, reasons.join("; ") || "未触发财务排雷扣分；后续接入财报排雷因子。", candidateSourceIds(candidate), "penalty");
}

function excludedReasons(candidate: Candidate): string[] {
  const reasons: string[] = [];
  if (/ST|\*|退/.test(candidate.stock.name)) reasons.push("ST/退市风险标签");
  if (candidate.matchedThemes.length === 0) reasons.push("未匹配产业主线");
  if ((candidate.stock.totalMarketCap ?? 0) > 0 && (candidate.stock.totalMarketCap ?? 0) < 1_000_000_000) reasons.push("市值过小，容量不足");
  return reasons;
}

function bucketFor(score: number, industry: QuantIndustryScore, gate: QuantEvidenceGate, excluded: string[]): QuantCandidateBucket {
  if (excluded.length > 0 || industry.tier === "Reject") return "reject";
  if (score >= 70 && gate === "pass" && (industry.tier === "A" || industry.tier === "B")) return "core";
  if (score >= 55 && gate !== "fail") return "watchlist";
  if (score < 35 && gate === "fail") return "reject";
  return "observe";
}

function technicalConfirmation(candidate: Candidate, industry: QuantIndustryScore): QuantCandidateOverlay["technicalConfirmation"] {
  const pct = candidate.stock.pctChange ?? 0;
  const turnover = candidate.stock.turnover ?? 0;
  const mainInflow = candidate.stock.mainNetInflow ?? 0;
  return {
    trend: pct > 0 ? `价格正反馈：涨跌幅 ${pct.toFixed(2)}%。` : `趋势未确认：涨跌幅 ${pct.toFixed(2)}%。`,
    volumePrice: mainInflow > 0 ? `量价/资金确认：主力净流入为正，换手 ${turnover.toFixed(2)}%。` : `量价/资金中性：主力净流入未确认，换手 ${turnover.toFixed(2)}%。`,
    liquidity: candidate.stock.latestPrice == null ? "价格缺失，需补行情。" : "行情字段可用，需在回测层继续处理涨跌停和成交约束。",
    marketConsensus: `行业 ${industry.tier} 档，成交集中或机构抱团不作为负面因子。`,
  };
}

export function scoreQuantCandidate(candidate: Candidate, industry: QuantIndustryScore, generatedAt = new Date().toISOString()): QuantCandidateOverlay {
  const gate = evidenceGate(candidate);
  const sources = candidateSourceIds(candidate);
  const serenityPosterior = component("serenity-posterior", scale(candidate.score, 100, 30), 30, `沿用 Serenity 产业链后验分 ${candidate.score.toFixed(1)}。`, sources);
  const industryComponent = component("industry-mainline-score", scale(industry.score, 100, 15), 15, `行业 ${industry.industryKey} 为 ${industry.tier} 档，主线分 ${industry.score.toFixed(1)}。`, sources);
  const components = [
    serenityPosterior,
    industryComponent,
    scoreFundamentalVerification(candidate),
    scoreQualitySafety(candidate),
    scoreRelativeTrend(candidate, industry),
    scoreVolumePrice(candidate),
    scoreValuation(candidate),
    scoreLiquidity(candidate),
    thunderstormPenalty(candidate),
  ];
  const total = clamp(components.reduce((sum, item) => sum + item.score, 0), 0, 100);
  const excluded = excludedReasons(candidate);
  const bucket = bucketFor(total, industry, gate, excluded);
  const warnings = [
    ...(gate === "pass" ? [] : ["产业证据尚未达到核心组合准入，只能进入观察或候选队列。"]),
    ...(candidate.trace.coverageGaps.length > 0 ? [`覆盖缺口：${candidate.trace.coverageGaps.slice(0, 2).join("；")}`] : []),
    NO_CROWDING_NOTE,
  ];

  return {
    strategy: SERENITY_QUANT_STRATEGY,
    generatedAt,
    stockScore: Number(total.toFixed(2)),
    bucket,
    evidenceGate: gate,
    industry,
    components,
    technicalConfirmation: technicalConfirmation(candidate, industry),
    warnings,
    excludedReasons: excluded,
    noCrowdingPenalty: true,
  };
}

function riskModeFor(candidates: Candidate[]): QuantRiskMode {
  const overlays = candidates.map((candidate) => candidate.quant).filter((item): item is QuantCandidateOverlay => item != null);
  const coreOrWatch = overlays.filter((item) => item.bucket === "core" || item.bucket === "watchlist").length;
  const positiveTrendRatio = candidates.filter((candidate) => (candidate.stock.pctChange ?? 0) > 0).length / Math.max(candidates.length, 1);
  if (coreOrWatch >= 5 && positiveTrendRatio >= 0.55) return "RiskOn";
  if (coreOrWatch >= 2 || positiveTrendRatio >= 0.35) return "Rebalance";
  return "RiskOff";
}

export function applySerenityQuantOverlay(candidates: Candidate[], generatedAt = new Date().toISOString()): { candidates: Candidate[]; summary: QuantScreenSummary } {
  const industryGroups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = industryKeyFor(candidate);
    industryGroups.set(key, [...(industryGroups.get(key) ?? []), candidate]);
  }

  const industryScores = new Map<string, QuantIndustryScore>();
  for (const [key, group] of industryGroups) {
    industryScores.set(key, scoreIndustry(key, group));
  }

  const scored = candidates
    .map((candidate) => {
      const industry = industryScores.get(industryKeyFor(candidate)) ?? scoreIndustry(industryKeyFor(candidate), [candidate]);
      return {
        ...candidate,
        quant: scoreQuantCandidate(candidate, industry, generatedAt),
      };
    })
    .sort((a, b) => {
      const bucketDiff = bucketRank(a.quant!.bucket) - bucketRank(b.quant!.bucket);
      if (bucketDiff !== 0) return bucketDiff;
      const quantDiff = b.quant!.stockScore - a.quant!.stockScore;
      if (quantDiff !== 0) return quantDiff;
      return b.score - a.score;
    });

  const bucketCounts = scored.reduce<Record<QuantCandidateBucket, number>>(
    (counts, candidate) => {
      counts[candidate.quant!.bucket] += 1;
      return counts;
    },
    { core: 0, watchlist: 0, observe: 0, reject: 0 },
  );

  const summary: QuantScreenSummary = {
    strategy: SERENITY_QUANT_STRATEGY,
    generatedAt,
    noCrowdingPenalty: true,
    riskMode: riskModeFor(scored),
    bucketCounts,
    industryTiers: [...industryScores.values()]
      .map((industry) => ({
        industryKey: industry.industryKey,
        score: industry.score,
        tier: industry.tier,
        candidateCount: industryGroups.get(industry.industryKey)?.length ?? 0,
      }))
      .sort((a, b) => b.score - a.score),
    notes: [
      "产业逻辑和趋势是准入门槛，技术面量化只做确认、排序和仓位辅助。",
      NO_CROWDING_NOTE,
      "当前为 screen-grade overlay：历史回测层后续可复用相同组件并替换趋势/景气代理指标。",
    ],
  };

  return { candidates: scored, summary };
}
