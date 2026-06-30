import type { BottleneckTheme, ChokePointConcept } from "../types.js";
import { DEFAULT_THEMES } from "../methodology.js";

/**
 * Distilled, ticker-INDEPENDENT chokepoint concepts derived from Serenity's public
 * archive. These store ONLY A-share segment keywords plus reference-only global
 * examples; no per-ticker US/HK call is ever stored as evidence here. Each concept
 * rolls up to one or more existing DEFAULT_THEMES via matchedThemeIds.
 */
export const SERENITY_DERIVED_CONCEPTS: ChokePointConcept[] = [
  {
    id: "cpo-laser-diodes",
    name: "CPO Laser Diodes (InP/InGaAs)",
    nameZh: "CPO 激光器 (磷化铟)",
    description: "供应受限的 CPO 光引擎激光器/光芯片环节，下游为超大规模数据中心光互联。",
    bottleneckMechanism: "supply-constrained",
    matchedThemeIds: ["ai-optical-cpo"],
    aShareIndustryKeywords: ["光通信", "通信设备", "光芯片"],
    aShareConceptKeywords: ["CPO", "硅光", "激光器", "InP", "磷化铟", "光器件"],
    globalExample: "SIVE:US",
    serenitySourceIds: ["SERENITY-ALEABITOREDDIT-ARCHIVE-20260611", "SERENITY-X-ARTICLE-SIVE-20260519"],
    chinaSubstituteStatus: "emerging-domestic",
    geopoliticalPolarity: "guochanti-positive",
    observedAt: "2026-06-08",
    expiresAt: "2026-09-08",
  },
  {
    id: "inp-compound-substrate",
    name: "InP / Compound-Semi Substrate",
    nameZh: "磷化铟 / 化合物半导体衬底",
    description: "光芯片与高速器件上游的 InP/GaAs 衬底环节，认证周期长、产能与良率受限。",
    bottleneckMechanism: "yield-limited",
    matchedThemeIds: ["ai-optical-cpo", "sovereign-semi"],
    aShareIndustryKeywords: ["半导体材料", "化合物半导体", "光通信"],
    aShareConceptKeywords: ["InP", "磷化铟", "GaAs", "砷化镓", "衬底", "外延片", "化合物半导体"],
    globalExample: "AXT:US",
    serenitySourceIds: ["SERENITY-ALEABITOREDDIT-ARCHIVE-20260611"],
    chinaSubstituteStatus: "emerging-domestic",
    geopoliticalPolarity: "mixed",
    observedAt: "2026-06-08",
    expiresAt: "2026-09-08",
  },
  {
    id: "hbm-advanced-packaging",
    name: "HBM / Advanced Packaging Capacity",
    nameZh: "HBM / 先进封装产能",
    description: "AI 算力存储与 CoWoS/先进封装产能卡点，设备、载板与测试环节受约束。",
    bottleneckMechanism: "capacity-gated",
    matchedThemeIds: ["advanced-packaging"],
    aShareIndustryKeywords: ["半导体", "封测", "先进封装", "半导体设备"],
    aShareConceptKeywords: ["HBM", "Chiplet", "先进封装", "CoWoS", "封测", "载板", "ABF", "测试设备"],
    globalExample: "HBM-chain (global)",
    serenitySourceIds: ["SERENITY-ALEABITOREDDIT-ARCHIVE-20260611"],
    chinaSubstituteStatus: "emerging-domestic",
    geopoliticalPolarity: "export-control-risk",
    observedAt: "2026-06-08",
    expiresAt: "2026-09-08",
  },
  {
    id: "mpo-optical-connectors",
    name: "MPO / Optical Connectors",
    nameZh: "MPO / 光连接器",
    description: "高密度光互联的 MPO/连接器与陶瓷插芯环节，随 800G/1.6T 放量而紧张。",
    bottleneckMechanism: "capacity-gated",
    matchedThemeIds: ["ai-optical-cpo"],
    aShareIndustryKeywords: ["光通信", "通信设备", "光器件"],
    aShareConceptKeywords: ["MPO", "连接器", "插芯", "陶瓷插芯", "光器件", "800G", "1.6T"],
    globalExample: "optical-connector chain (global)",
    serenitySourceIds: ["SERENITY-ALEABITOREDDIT-ARCHIVE-20260611"],
    chinaSubstituteStatus: "established-domestic",
    geopoliticalPolarity: "guochanti-positive",
    observedAt: "2026-06-08",
    expiresAt: "2026-09-08",
  },
  {
    id: "ai-power-800vdc",
    name: "AI Power / 800VDC / Power Semi",
    nameZh: "AI 电力 / 800VDC / 功率半导体",
    description: "数据中心高压直流供电与功率半导体卡点，随机柜功率密度提升而扩张。",
    bottleneckMechanism: "supply-constrained",
    matchedThemeIds: ["power-semi-800vdc"],
    aShareIndustryKeywords: ["电源设备", "功率半导体", "电力设备"],
    aShareConceptKeywords: ["800V", "800VDC", "SiC", "碳化硅", "GaN", "氮化镓", "功率半导体", "变流器"],
    globalExample: "AI-power chain (global)",
    serenitySourceIds: ["SERENITY-ALEABITOREDDIT-ARCHIVE-20260611"],
    chinaSubstituteStatus: "emerging-domestic",
    geopoliticalPolarity: "guochanti-positive",
    observedAt: "2026-06-08",
    expiresAt: "2026-09-08",
  },
];

/** Concepts that roll up to a given theme (exposes taxonomy linkage). */
export function conceptsForTheme(themeId: string): ChokePointConcept[] {
  return SERENITY_DERIVED_CONCEPTS.filter((concept) => concept.matchedThemeIds.includes(themeId));
}

/**
 * Systematically extend DEFAULT_THEMES when a concept maps to no existing theme.
 * Returns null when it already rolls up to an existing theme. Never stamps any
 * Serenity source ID anywhere, keeping concepts out of scoring provenance.
 */
export function proposeThemeExtension(
  concept: ChokePointConcept,
  existingThemes: BottleneckTheme[] = DEFAULT_THEMES,
): BottleneckTheme | null {
  if (existingThemes.some((theme) => concept.matchedThemeIds.includes(theme.id))) return null;
  return {
    id: `theme-${concept.id}`,
    label: concept.nameZh || concept.name,
    keywords: [...new Set([...concept.aShareConceptKeywords, ...concept.aShareIndustryKeywords])],
    positiveSignals: ["客户验证", "产能放量", "国产替代", "订单"],
    negativeSignals: ["替代路线", "客户自研", "价格战", "扩产过快"],
    supportingConceptIds: [concept.id],
  };
}
