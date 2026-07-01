import type {
  AShareStock,
  BottleneckTheme,
  Candidate,
  EvidenceItem,
  IndustryLogicAssessment,
  MethodologyTrace,
  NegativeSignalAssessment,
  ScoreComponent,
  SourceRecord,
  SupplyReleaseAssessment,
} from "./types.js";
import { extractCandidateEvidence, summarizeEvidence } from "./research/evidence.js";
import { buildSupplyChainGraph } from "./research/graph.js";
import { buildKillCriteria } from "./research/kill-criteria.js";

export const DEFAULT_THEMES: BottleneckTheme[] = [
  {
    id: "ai-optical-cpo",
    label: "AI 光互联 / CPO / 硅光",
    keywords: ["CPO", "光通信", "光模块", "硅光", "光芯片", "激光器", "磷化铟", "InP", "光器件", "光电共封装"],
    positiveSignals: ["下游 AI capex 扩散", "客户验证", "产能放量", "国产替代"],
    negativeSignals: ["铜互连延寿", "客户自研", "价格战", "产能扩张过快"],
  },
  {
    id: "power-semi-800vdc",
    label: "数据中心电力 / 800VDC / 功率半导体",
    keywords: ["功率半导体", "SiC", "碳化硅", "氮化镓", "GaN", "800V", "电源管理", "变流器", "逆变器"],
    positiveSignals: ["AI 机柜功率密度提升", "高压直流架构", "良率提升"],
    negativeSignals: ["传统供电方案延续", "海外龙头降价", "库存周期"],
  },
  {
    id: "robotics-supply-chain",
    label: "机器人 / 具身智能硬件供应链",
    keywords: ["机器人", "减速器", "丝杠", "传感器", "执行器", "伺服", "稀土", "磁材", "空心杯"],
    positiveSignals: ["量产节点明确", "客户定点", "核心零部件瓶颈"],
    negativeSignals: ["整机进度不及预期", "国产供应商过度拥挤", "BOM 降本压力"],
  },
  {
    id: "advanced-packaging",
    label: "先进封装 / 测试 / 设备材料",
    keywords: ["先进封装", "Chiplet", "HBM", "封测", "测试设备", "玻璃基板", "ABF", "载板", "互连"],
    positiveSignals: ["CoWoS/封装产能约束", "设备验证", "扩产订单"],
    negativeSignals: ["扩产周期过长", "客户集中", "技术路线切换"],
  },
  {
    id: "sovereign-semi",
    label: "半导体自主可控 / 关键设备材料",
    keywords: ["半导体", "光刻", "刻蚀", "薄膜", "EDA", "材料", "靶材", "电子特气", "晶圆"],
    positiveSignals: ["政策背书", "国产替代", "供应安全溢价"],
    negativeSignals: ["估值拥挤", "制裁扰动", "验证周期慢"],
  },
];

export const METHODOLOGY_NOTE = `# Serenity 产业链瓶颈方法论

本方法论用于研究，不构成投资建议或自动交易指令。

## 核心框架

1. 先从产业结构而不是股价开始：论文、BOM、供应链地图、客户关系、良率、产能、标准演进。
2. 寻找“下一层瓶颈”：当市场只看到表层需求时，向上游材料、设备、封装、光互联、电力、执行器等环节拆解。
3. 形成高质量先验：产业位置、TAM 拐点、客户验证、政策/资本开支、竞争格局、估值错配。
4. 在不完全信息下行动：只在期望值足够且可证伪路径清楚时进入观察/候选，不追求 100% 确定。
5. 持有期间用证据更新：财报、公告、订单、产能、管理层表述、卖方研报、客户映射、价格/量能。
6. 负面证据同等重要：替代路线、客户自研、稀释、管理层失信、竞争扩产、拥挤交易都会降低后验。
7. 动态轮动到后验最高处：资金和研究精力流向最活跃、最可验证、风险收益更好的瓶颈。

## 蒸馏增强规则

以下规则来自 SERENITY-REPLY-DISTILLATION-20260530 的外部方法论蒸馏，只作为研究框架输入，不作为任何候选公司的主证据：

1. 瓶颈博弈优先于扩张叙事：评估关键环节时先问“如果该环节断供或良率不足，谁的产能、路线图或毛利会被卡住”，再看传统收入扩张指标。
2. NVIDIA/头部客户信号是线索，不是结论：大额投资、架构路线、供应商绑定可以触发研究，但必须落到公司披露、订单、客户验证或独立产业证据。
3. 信息不对称只在可验证时有价值：小市值、技术复杂、机构覆盖少是先验加分项；如果无法补齐 P0/P1 证据，只能保留为低/中置信线索。
4. 地缘政治和供应安全要双向计价：国产替代、出口管制、稀土/关键材料本土化可能带来溢价，也可能带来制裁、客户切换和政策波动风险。
5. 机构跟随只能作为后验更新：资金流、卖方覆盖和机构买入可验证 thesis 进入主流视野，但不能替代底层供应链证据。

## 趋势优先产业排序框架

以下规则来自用户提供的前半导体基金经理近期产业逻辑梳理，只作为方法论输入，不作为任何候选公司的主证据。系统必须以产业逻辑和趋势为核心主导，先排序产业链环节，再映射 A 股公司：

1. 时代主线优先：先判断资本开支、利润、产能和估值会往哪个产业方向迁移，再讨论个股估值和交易热度。
2. 拥挤度需要重定义：早期主线的资源集中、讨论集中和资金集中不等于泡沫；真正危险的是未来增量已经被充分定价，且缺少订单、价格、产能或客户验证的新证据。
3. 下一层瓶颈优先：从整机/模块继续下钻到光芯片、InP、硅光、MPO/连接器、测试设备、PCB/铜箔/MLCC、设备材料等卡点，优先寻找断供、良率、认证、扩产周期和价格弹性。
4. 预期差不是冷门：高关注方向仍可能有业绩超预期，冷门方向也可能没有催化。有效预期差必须落到 Q2/Q3/年度业绩、订单、客户导入、扩产和价格变化。
5. 产业逻辑要量化：每条瓶颈线索都应尽量拆成“需求量 -> 供给量 -> 缺口 -> 价格 -> 单位利润 -> 公司弹性”，缺任一环节必须进入覆盖缺口。
6. 区分产业正确和交易正确：产业趋势正确也可能因为兑现窗口过早、估值透支、供给快速释放或技术路线切换而阶段性不可投。

## 推理出处分层

输出中的判断必须能被读者区分出处强度：

- 直接证据：来自公告、年报、监管披露、投资者关系、客户/供应商公开材料等可追溯来源。
- 多源归纳：多个独立来源共同支持的稳定模式，例如产业链映射、客户验证、产能约束。
- 框架外推：用 Serenity-derived 框架推导但尚无直接证据的判断，必须明确写成“框架推断，不是结论”。
- 坦承无据：材料不支持时直接说明缺口，不用自信语气填补。

## 反证与失效模式

- 替代供应、客户自研、技术路线切换会削弱“不可替代”叙事。
- 估值纪律是独立约束：瓶颈正确也可能因过高估值、流动性收缩或拥挤交易产生大幅回撤。
- 幸存者偏差必须显式处理：不能只用成功案例校准方法论，要记录反转、失败和沉默样本。
- KOL 履历、收益率、仓位和历史准确率若缺少独立验证，只能作为背景，不得进入候选置信度。
- 宽列表和事后挑选赢家会高估命中率；报告应优先给出可证伪路径和风险触发条件。

## Agent 输出约束

- 每个候选必须给出来源 ID、证据等级、风险和覆盖缺口。
- 社交媒体只能作为线索，不得单独支持高置信度结论。
- 高置信度必须有 P0 主来源和至少一个独立 P1/P2 交叉验证。
- 对杠杆、借钱、梭哈、期权玩法、精确仓位比例等高风险请求，必须拒绝给具体执行建议，只能返回风险和研究框架。
- 不得以第一人称扮演 Serenity；可以说“Serenity-derived framework / Serenity 方法论视角”。
- 输出是研究候选，不是买卖建议。
`;

function normalizeText(stock: AShareStock): string {
  return [stock.name, stock.industry, stock.concept, stock.region].join(" ").toLowerCase();
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function sourceHaystack(source: SourceRecord): string {
  return [source.id, source.title, source.publisher, source.summary, ...source.evidenceTags].join(" ").toLowerCase();
}

function sourceMatchesCandidate(source: SourceRecord, stock: AShareStock, matchedThemes: Candidate["matchedThemes"]): boolean {
  const haystack = sourceHaystack(source);
  const identityTerms = [stock.code, stock.name].map((term) => term.trim().toLowerCase()).filter((term) => term.length >= 2);
  const directIdentityMatch = identityTerms.some((term) => haystack.includes(term));
  const companySpecificSource = source.evidenceTags.includes("candidate-direct") || source.sourceType === "broker_report";
  if (companySpecificSource && !source.evidenceTags.includes("sector-report")) return directIdentityMatch;
  const terms = [
    stock.code,
    stock.name,
    stock.industry,
    stock.region,
    ...stock.concept.split(/\s+/),
    ...matchedThemes.flatMap((match) => [match.themeId, match.label, ...match.keywords]),
  ]
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 2);
  return terms.some((term) => haystack.includes(term));
}

const PRIMARY_TREND_TERMS = [
  "AI",
  "AI算力",
  "大模型",
  "数据中心",
  "CPO",
  "光通信",
  "光模块",
  "光芯片",
  "硅光",
  "InP",
  "800G",
  "1.6T",
  "OCS",
  "MPO",
  "先进封装",
  "HBM",
  "Chiplet",
  "机器人",
  "商业航天",
  "低空经济",
];

const NEXT_LAYER_BOTTLENECK_TERMS = [
  "瓶颈",
  "卡脖子",
  "光芯片",
  "激光器",
  "磷化铟",
  "InP",
  "硅光",
  "硅光foundry",
  "MPO",
  "连接器",
  "OCS",
  "测试设备",
  "铜箔",
  "HVLP",
  "mSAP",
  "PCB",
  "CCL",
  "MLCC",
  "载板",
  "设备",
  "材料",
  "良率",
  "认证",
  "扩产难",
];

const SUPPLY_DEMAND_PROFIT_TERMS = [
  "订单",
  "客户",
  "需求",
  "供给",
  "缺口",
  "缺货",
  "断供",
  "产能",
  "扩产",
  "放量",
  "涨价",
  "价格",
  "单价",
  "毛利",
  "净利",
  "吨盈利",
  "利润弹性",
];

const EXPECTATION_VALIDATION_TERMS = [
  "预期差",
  "超预期",
  "低于预期",
  "业绩",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "FY",
  "验证",
  "认证",
  "导入",
  "定点",
  "催化",
  "兑现",
  "订单",
  "放量",
];

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function combinedResearchText(stock: AShareStock, sources: SourceRecord[], matchedThemes: Candidate["matchedThemes"]): string {
  return [
    stock.name,
    stock.industry,
    stock.concept,
    stock.region,
    ...matchedThemes.flatMap((theme) => [theme.label, ...theme.keywords]),
    ...sources.map(sourceHaystack),
  ]
    .join(" ")
    .toLowerCase();
}

function matchingTerms(text: string, terms: string[]): string[] {
  return uniqueStrings(terms.filter((term) => text.includes(term.toLowerCase())));
}

function componentSources(sources: SourceRecord[]): string[] {
  return uniqueStrings(["EASTMONEY-A-SHARE-SNAPSHOT", ...sources.map((source) => source.id)]).slice(0, 12);
}

export function assessIndustryLogic(
  stock: AShareStock,
  sources: SourceRecord[],
  matchedThemes = matchThemes(stock),
): IndustryLogicAssessment {
  const text = combinedResearchText(stock, sources, matchedThemes);
  const trendHits = matchingTerms(text, PRIMARY_TREND_TERMS);
  const bottleneckHits = matchingTerms(text, NEXT_LAYER_BOTTLENECK_TERMS);
  const supplyHits = matchingTerms(text, SUPPLY_DEMAND_PROFIT_TERMS);
  const validationHits = matchingTerms(text, EXPECTATION_VALIDATION_TERMS);
  const sourceValidationBoost = sources.some((source) => source.tier === "P0" || source.tier === "P1") ? 2 : 0;

  const primaryTrendScore = clamp(matchedThemes.length * 8 + trendHits.length * 1.5, 0, 25);
  const bottleneckDepthScore = clamp(bottleneckHits.length * 2 + (matchedThemes.length > 0 ? 2 : 0), 0, 20);
  const supplyDemandProfitScore = clamp(supplyHits.length * 1.6 + sources.filter((source) => source.evidenceTags.includes("candidate-direct")).length * 1.5, 0, 15);
  const expectationGapScore = clamp(validationHits.length * 1.4 + sourceValidationBoost, 0, 12);
  const totalScore = clamp(primaryTrendScore + bottleneckDepthScore + supplyDemandProfitScore + expectationGapScore, 0, 72);
  const keySignals = uniqueStrings([...trendHits, ...bottleneckHits, ...supplyHits, ...validationHits]).slice(0, 16);
  const missingSignals = [
    ...(primaryTrendScore >= 15 ? [] : ["时代主线强度不足：需要证明资本开支、利润或产能正在向该方向迁移。"]),
    ...(bottleneckDepthScore >= 10 ? [] : ["下一层瓶颈未拆透：需要定位材料、设备、芯片、连接器、测试或良率等卡点。"]),
    ...(supplyDemandProfitScore >= 8 ? [] : ["供需和利润弹性证据不足：缺需求量、供给量、价格、单位利润或公司弹性。"]),
    ...(expectationGapScore >= 6 ? [] : ["预期差和验证窗口不足：缺订单、客户导入、Q2/Q3/年度业绩或价格验证。"]),
  ];
  const thesisTheme = matchedThemes.map((theme) => theme.label).join(" / ") || "未匹配明确主线";
  const bottleneckSummary = bottleneckHits.slice(0, 5).join(" / ") || "下一层瓶颈待拆解";

  return {
    primaryTrendScore,
    bottleneckDepthScore,
    supplyDemandProfitScore,
    expectationGapScore,
    totalScore,
    thesis: `${thesisTheme} -> ${bottleneckSummary}`,
    validationWindow:
      expectationGapScore >= 8
        ? "已有订单、客户、业绩或价格线索，可进入近端验证。"
        : "先补齐订单、价格、扩产、客户导入和 Q2/Q3/年度业绩证据，再上调置信度。",
    keySignals,
    missingSignals,
  };
}

const NEGATIVE_SIGNAL_UNIT_PENALTY = 3;
const NEGATIVE_SIGNAL_MAX_PENALTY = 18;

// Capital-cycle / supply-side reversal terms. Distinct from theme negativeSignals and from
// the positive supply/demand terms (which reward 产能放量/扩产订单): these are unambiguous
// oversupply / capacity-overshoot / competitive-entry signals that dissolve a chokepoint.
const SUPPLY_RELEASE_TERMS = [
  "产能过剩",
  "供给过剩",
  "供给释放",
  "产能释放",
  "大幅扩产",
  "扩产潮",
  "新进入者",
  "低价竞争",
  "过度扩产",
  "供给冲击",
  "同质化竞争",
  "产能利用率下降",
];

const SUPPLY_RELEASE_UNIT_PENALTY = 3;
const SUPPLY_RELEASE_MAX_PENALTY = 15;

export function assessNegativeSignals(
  stock: AShareStock,
  sources: SourceRecord[],
  matchedThemes = matchThemes(stock),
  themes = DEFAULT_THEMES,
): NegativeSignalAssessment {
  const text = combinedResearchText(stock, sources, matchedThemes);
  const matchedIds = new Set(matchedThemes.map((match) => match.themeId));
  const matched = themes
    .filter((theme) => matchedIds.has(theme.id))
    .map((theme) => ({
      themeId: theme.id,
      label: theme.label,
      signals: uniqueStrings(theme.negativeSignals.filter((signal) => text.includes(signal.toLowerCase()))),
    }))
    .filter((entry) => entry.signals.length > 0);
  const hitSignals = uniqueStrings(matched.flatMap((entry) => entry.signals));
  const penalty = clamp(hitSignals.length * NEGATIVE_SIGNAL_UNIT_PENALTY, 0, NEGATIVE_SIGNAL_MAX_PENALTY);
  return { matched, hitSignals, penalty };
}

export function assessSupplyRelease(
  stock: AShareStock,
  sources: SourceRecord[],
  matchedThemes = matchThemes(stock),
): SupplyReleaseAssessment {
  const text = combinedResearchText(stock, sources, matchedThemes);
  const hitTerms = matchingTerms(text, SUPPLY_RELEASE_TERMS);
  const penalty = clamp(hitTerms.length * SUPPLY_RELEASE_UNIT_PENALTY, 0, SUPPLY_RELEASE_MAX_PENALTY);
  return { hitTerms, penalty };
}

export function relevantSourcesForCandidate(
  stock: AShareStock,
  sources: SourceRecord[],
  matchedThemes = matchThemes(stock),
): SourceRecord[] {
  return sources.filter((source) => sourceMatchesCandidate(source, stock, matchedThemes));
}

function strongestTier(sources: SourceRecord[]): "P0" | "P1" | "P2" {
  if (sources.some((source) => source.tier === "P0")) return "P0";
  if (sources.some((source) => source.tier === "P1")) return "P1";
  return "P2";
}

function sourceQualityScore(sources: SourceRecord[]): ScoreComponent {
  const tiers = new Set(sources.map((source) => source.tier));
  let score = 0;
  if (tiers.has("P0")) score += 8;
  if (tiers.has("P1")) score += 5;
  if (tiers.has("P2")) score += 2;
  return {
    name: "source-quality",
    score: clamp(score, 0, 15),
    maxScore: 15,
    reason: `Candidate-relevant source tiers: ${[...tiers].sort().join(", ") || "none"}.`,
    sourceIds: sources.map((source) => source.id),
  };
}

export function matchThemes(stock: AShareStock, themes = DEFAULT_THEMES): Candidate["matchedThemes"] {
  const haystack = normalizeText(stock);
  return themes
    .map((theme) => ({
      themeId: theme.id,
      label: theme.label,
      keywords: theme.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())),
    }))
    .filter((match) => match.keywords.length > 0);
}

export function scoreCandidate(stock: AShareStock, sources: SourceRecord[], themes = DEFAULT_THEMES): Candidate {
  const matchedThemes = matchThemes(stock, themes);
  const candidateSources = relevantSourcesForCandidate(stock, sources, matchedThemes);
  const industryLogic = assessIndustryLogic(stock, candidateSources, matchedThemes);
  const valuationScore = stock.pe == null ? 4 : stock.pe > 0 && stock.pe < 80 ? 8 : stock.pe >= 80 && stock.pe < 160 ? 4 : 1;
  const marketConfirmationScore = (stock.turnover == null ? 1 : stock.turnover >= 3 ? 3 : stock.turnover >= 1 ? 2 : 0) + ((stock.mainNetInflow ?? 0) > 0 ? 2 : 0);
  const quality = sourceQualityScore(candidateSources);
  const industrySourceIds = componentSources(candidateSources);
  const negativeAssessment = assessNegativeSignals(stock, candidateSources, matchedThemes, themes);
  const supplyAssessment = assessSupplyRelease(stock, candidateSources, matchedThemes);

  const components: ScoreComponent[] = [
    {
      name: "industry-trend-primacy",
      score: industryLogic.primaryTrendScore,
      maxScore: 25,
      reason:
        matchedThemes.length > 0
          ? `Trend thesis: ${industryLogic.thesis}. Matched ${matchedThemes.map((match) => `${match.label}(${match.keywords.join("/")})`).join("; ")}.`
          : "No configured era-level industry trend matched industry/concept/name.",
      sourceIds: industrySourceIds,
    },
    {
      name: "bottleneck-cascade-depth",
      score: industryLogic.bottleneckDepthScore,
      maxScore: 20,
      reason: `Next-layer bottleneck signals: ${industryLogic.keySignals.filter((term) => NEXT_LAYER_BOTTLENECK_TERMS.includes(term)).join(", ") || "not yet explicit"}.`,
      sourceIds: industrySourceIds,
    },
    {
      name: "supply-demand-profit-elasticity",
      score: industryLogic.supplyDemandProfitScore,
      maxScore: 15,
      reason: "Scores demand, supply gap, price, unit profit and company elasticity signals before market factors.",
      sourceIds: industrySourceIds,
    },
    {
      name: "expectation-gap-validation-window",
      score: industryLogic.expectationGapScore,
      maxScore: 12,
      reason: industryLogic.validationWindow,
      sourceIds: industrySourceIds,
    },
    quality,
    {
      name: "valuation-discipline",
      score: valuationScore,
      maxScore: 8,
      reason: stock.pe == null ? "PE unavailable." : `PE ${stock.pe.toFixed(2)}.`,
      sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
    },
    {
      name: "market-confirmation",
      score: marketConfirmationScore,
      maxScore: 5,
      reason: `Turnover ${stock.turnover == null ? "n/a" : `${stock.turnover.toFixed(2)}%`}; main net inflow ${(stock.mainNetInflow ?? 0) > 0 ? "positive" : "not positive"}.`,
      sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
    },
    {
      name: "negative-signal-penalty",
      score: negativeAssessment.penalty > 0 ? -negativeAssessment.penalty : 0,
      maxScore: 0,
      reason:
        negativeAssessment.hitSignals.length > 0
          ? `瓶颈空头信号触发后验下调：${negativeAssessment.hitSignals.join("、")}。`
          : "未匹配到配置内主题空头信号（替代路线/客户自研/价格战/技术路线切换等）。",
      sourceIds: industrySourceIds,
    },
    {
      name: "capital-cycle-supply",
      score: supplyAssessment.penalty > 0 ? -supplyAssessment.penalty : 0,
      maxScore: 0,
      reason:
        supplyAssessment.hitTerms.length > 0
          ? `资本周期/供给侧释放下调后验（瓶颈耐久度削弱）：${supplyAssessment.hitTerms.join("、")}。`
          : "未见供给过剩/大幅扩产/新进入者等资本周期反转信号。",
      sourceIds: industrySourceIds,
    },
  ];

  const priorScore = clamp(industryLogic.totalScore);
  const posteriorScore = clamp(components.reduce((sum, component) => sum + component.score, 0));
  const riskPenalty = (stock.pe != null && stock.pe < 0 ? 8 : 0) + (stock.pe != null && stock.pe >= 160 ? 4 : 0);
  const expectedValueScore = clamp(posteriorScore - riskPenalty);
  const evidence: EvidenceItem[] = components.map((component, index) => ({
    id: `EV-${index + 1}`,
    title: component.name,
    tier: component.name === "source-quality" ? strongestTier(candidateSources) : "P2",
    polarity: component.score > 0 ? "positive" : component.score < 0 ? "negative" : "neutral",
    weight: Math.abs(component.score),
    description: component.reason,
    sourceIds: component.sourceIds,
    tags: [component.name],
  }));
  const risks = [
    "主题拥挤和短期波动可能显著影响价格。",
    "产业趋势正确不等于交易正确；若订单、价格、扩产或业绩验证缺失，需降低兑现窗口判断。",
    "产业链映射可能存在客户 NDA、误读或验证周期延迟。",
  ];
  if (stock.pe != null && stock.pe < 0) risks.push("当前 PE 为负，盈利质量需要额外核验。");
  if (negativeAssessment.hitSignals.length > 0) {
    risks.push(`瓶颈空头信号: ${negativeAssessment.hitSignals.join(" / ")}（已计入后验下调 ${negativeAssessment.penalty} 分）。`);
  }
  if (supplyAssessment.hitTerms.length > 0) {
    risks.push(`资本周期反转信号: ${supplyAssessment.hitTerms.join(" / ")}（供给释放削弱瓶颈耐久度，已计入后验下调 ${supplyAssessment.penalty} 分）。`);
  }

  const generatedAt = new Date().toISOString();
  const trace: MethodologyTrace = {
    priorScore,
    posteriorScore,
    expectedValueScore,
    industryLogic,
    components,
    evidence,
    risks,
    coverageGaps: [],
    negativeSignals: negativeAssessment.hitSignals,
    supplyReleaseSignals: supplyAssessment.hitTerms,
  };
  const candidate: Candidate = {
    stock,
    matchedThemes,
    score: expectedValueScore,
    confidence: expectedValueScore >= 45 ? "medium" : "low",
    trace,
    generatedAt,
  };

  const structuredEvidence = extractCandidateEvidence(candidate, sources);
  const evidenceSummary = summarizeEvidence(structuredEvidence);
  const graph = buildSupplyChainGraph(candidate, structuredEvidence);
  const hasCandidateP0 = evidenceSummary.hasCandidateP0;
  const hasIndependentCorroboration = structuredEvidence.some((source) => (source.tier === "P1" || source.tier === "P2") && (source.direct || source.kind === "market-signal"));
  const coverageGaps = [
    ...(hasCandidateP0 ? [] : ["候选级 P0 证据尚需补齐：交易所公告、公司年报/互动易/投资者关系材料。"]),
    ...(structuredEvidence.some((item) => item.kind === "broker-report" && item.direct)
      ? []
      : ["卖方研报需由用户放入 report inbox 或配置授权数据源后纳入验证。"]),
    ...industryLogic.missingSignals,
  ];
  if (!sources.some((source) => source.tier === "P0")) coverageGaps.push("当前全局来源库缺少 P0 主来源目录，禁止标记为高置信度。");
  if (!hasCandidateP0) coverageGaps.push("全局主来源目录不能替代候选级 P0 证据；需补齐该公司/该环节的公告、年报或监管披露。");
  for (const gap of graph.unresolvedLinks) coverageGaps.push(gap);

  const killCriteria = buildKillCriteria({
    matchedThemeLabels: matchedThemes.map((theme) => theme.label),
    hasCandidateP0,
    expectationGapScore: industryLogic.expectationGapScore,
    negativeHitSignals: negativeAssessment.hitSignals,
    supplyReleaseTerms: supplyAssessment.hitTerms,
    pe: stock.pe,
    entryDate: generatedAt,
  });

  candidate.confidence = expectedValueScore >= 70 && hasCandidateP0 && hasIndependentCorroboration ? "high" : expectedValueScore >= 45 ? "medium" : "low";
  candidate.trace = {
    ...trace,
    structuredEvidence,
    graph,
    nextActions: evidenceSummary.nextActions,
    coverageGaps: [...new Set(coverageGaps)],
    killCriteria,
  };

  return candidate;
}

export function methodologySummary(): string {
  return METHODOLOGY_NOTE;
}
