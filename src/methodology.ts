import type {
  AShareStock,
  BottleneckTheme,
  Candidate,
  EvidenceItem,
  MethodologyTrace,
  ScoreComponent,
  SourceRecord,
} from "./types.js";

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

## Agent 输出约束

- 每个候选必须给出来源 ID、证据等级、风险和覆盖缺口。
- 社交媒体只能作为线索，不得单独支持高置信度结论。
- 高置信度必须有 P0 主来源和至少一个独立 P1/P2 交叉验证。
- 输出是研究候选，不是买卖建议。
`;

function normalizeText(stock: AShareStock): string {
  return [stock.name, stock.industry, stock.concept, stock.region].join(" ").toLowerCase();
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
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
    reason: `Source coverage tiers: ${[...tiers].sort().join(", ") || "none"}.`,
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
  const themeScore = Math.min(35, matchedThemes.reduce((sum, match) => sum + 8 + match.keywords.length * 2, 0));
  const marketCapB = (stock.totalMarketCap ?? 0) / 1_000_000_000;
  const asymmetryScore = marketCapB > 0 && marketCapB <= 30 ? 15 : marketCapB <= 80 ? 10 : marketCapB <= 150 ? 5 : 0;
  const liquidityScore = stock.turnover == null ? 4 : stock.turnover >= 3 ? 10 : stock.turnover >= 1 ? 7 : 3;
  const valuationScore = stock.pe == null ? 4 : stock.pe > 0 && stock.pe < 80 ? 10 : stock.pe >= 80 && stock.pe < 160 ? 5 : 1;
  const flowScore = (stock.mainNetInflow ?? 0) > 0 ? 5 : 0;
  const quality = sourceQualityScore(sources);

  const components: ScoreComponent[] = [
    {
      name: "theme-chokepoint-fit",
      score: themeScore,
      maxScore: 35,
      reason:
        matchedThemes.length > 0
          ? `Matched ${matchedThemes.map((match) => `${match.label}(${match.keywords.join("/")})`).join("; ")}.`
          : "No configured bottleneck theme matched industry/concept/name.",
      sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
    },
    {
      name: "small-mid-cap-asymmetry",
      score: asymmetryScore,
      maxScore: 15,
      reason: marketCapB > 0 ? `Total market cap approx ${marketCapB.toFixed(1)}B CNY.` : "Market cap unavailable.",
      sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
    },
    {
      name: "liquidity-turnover",
      score: liquidityScore,
      maxScore: 10,
      reason: stock.turnover == null ? "Turnover unavailable." : `Turnover ${stock.turnover.toFixed(2)}%.`,
      sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
    },
    {
      name: "valuation-sanity",
      score: valuationScore,
      maxScore: 10,
      reason: stock.pe == null ? "PE unavailable." : `PE ${stock.pe.toFixed(2)}.`,
      sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
    },
    {
      name: "capital-flow-confirmation",
      score: flowScore,
      maxScore: 5,
      reason: (stock.mainNetInflow ?? 0) > 0 ? "Positive main net inflow in snapshot." : "No positive main net inflow confirmation.",
      sourceIds: ["EASTMONEY-A-SHARE-SNAPSHOT"],
    },
    quality,
  ];

  const priorScore = clamp(themeScore + asymmetryScore + valuationScore);
  const posteriorScore = clamp(components.reduce((sum, component) => sum + component.score, 0));
  const riskPenalty = stock.pe != null && stock.pe < 0 ? 8 : 0;
  const expectedValueScore = clamp(posteriorScore - riskPenalty);
  const evidence: EvidenceItem[] = components.map((component, index) => ({
    id: `EV-${index + 1}`,
    title: component.name,
    tier: component.name === "source-quality" ? "P1" : "P2",
    polarity: component.score > 0 ? "positive" : "neutral",
    weight: component.score,
    description: component.reason,
    sourceIds: component.sourceIds,
    tags: [component.name],
  }));
  const coverageGaps = [
    "候选级 P0 证据尚需补齐：交易所公告、公司年报/互动易/投资者关系材料。",
    "卖方研报需由用户放入 report inbox 或配置授权数据源后纳入验证。",
  ];
  if (!sources.some((source) => source.tier === "P0")) coverageGaps.push("当前全局来源库缺少 P0 主来源，禁止标记为高置信度。");

  const risks = [
    "主题拥挤和短期波动可能显著影响价格。",
    "产业链映射可能存在客户 NDA、误读或验证周期延迟。",
  ];
  if (stock.pe != null && stock.pe < 0) risks.push("当前 PE 为负，盈利质量需要额外核验。");

  const confidence = expectedValueScore >= 70 && sources.some((source) => source.tier === "P0") ? "high" : expectedValueScore >= 45 ? "medium" : "low";
  const trace: MethodologyTrace = {
    priorScore,
    posteriorScore,
    expectedValueScore,
    components,
    evidence,
    risks,
    coverageGaps,
  };

  return {
    stock,
    matchedThemes,
    score: expectedValueScore,
    confidence,
    trace,
    generatedAt: new Date().toISOString(),
  };
}

export function methodologySummary(): string {
  return METHODOLOGY_NOTE;
}
