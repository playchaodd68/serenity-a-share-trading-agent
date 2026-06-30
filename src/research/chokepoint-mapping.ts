import { callFfdTool } from "../connectors/ffd.js";
import { relevantSourcesForCandidate, scoreCandidate } from "../methodology.js";
import { isCandidateSpecificPrimarySource } from "./evidence.js";
import { isSerenityFrameworkSource } from "../sources/serenity-boundary.js";
import { SERENITY_DERIVED_CONCEPTS } from "./chokepoint-library.js";
import type {
  AShareStock,
  Candidate,
  ChokePointConcept,
  ChokePointMapStatus,
  ChokePointProvenance,
  ChokePointResolution,
  SourceRecord,
} from "../types.js";

const MIN_CONSTITUENTS_FOR_CLEAN = 1;

/** Parse FFD stock rows out of FfdToolResult.json (already JSON-parsed in connectors/ffd.ts). */
export function parseFfdStocks(json: unknown): AShareStock[] {
  const payload = json as Record<string, unknown> | unknown[] | null | undefined;
  const rows = Array.isArray(payload)
    ? payload
    : ((payload as Record<string, unknown>)?.stocks as unknown[]) ??
      ((payload as Record<string, unknown>)?.data as unknown[]) ??
      ((payload as Record<string, unknown>)?.list as unknown[]) ??
      [];
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof (row as Record<string, unknown>).code === "string")
    .map((row) => ({
      code: String(row.code),
      name: typeof row.name === "string" ? row.name : "",
      latestPrice: numberOrNull(row.latestPrice ?? row.price),
      pctChange: numberOrNull(row.pctChange),
      totalMarketCap: numberOrNull(row.totalMarketCap),
      floatMarketCap: numberOrNull(row.floatMarketCap),
      pe: numberOrNull(row.pe),
      turnover: numberOrNull(row.turnover),
      mainNetInflow: numberOrNull(row.mainNetInflow),
      industry: typeof row.industry === "string" ? row.industry : "",
      region: typeof row.region === "string" ? row.region : "",
      concept: typeof row.concept === "string" ? row.concept : "",
    } satisfies AShareStock));
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Runtime FFD lookup: concept segment keywords -> live A-share constituents. */
async function resolveConstituents(
  concept: ChokePointConcept,
  gaps: string[],
): Promise<{ stocks: AShareStock[]; method: ChokePointResolution["resolutionMethod"] }> {
  const out: AShareStock[] = [];
  const dedupe = (rows: AShareStock[]): void => {
    for (const stock of rows) if (!out.some((existing) => existing.code === stock.code)) out.push(stock);
  };

  for (const key of concept.aShareIndustryKeywords) {
    try {
      const result = await callFfdTool("ffd_industry_stocks", { query: key, format: "json" });
      dedupe(parseFfdStocks(result.json));
    } catch (error) {
      gaps.push(`ffd_industry_stocks("${key}") 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (out.length > 0) return { stocks: out, method: "ffd_industry_stocks" };

  for (const key of concept.aShareConceptKeywords.slice(0, 2)) {
    try {
      const result = await callFfdTool("ffd_screen_stocks", { concept: key, market: "stock", format: "json", limit: 50 });
      dedupe(parseFfdStocks(result.json));
    } catch (error) {
      gaps.push(`ffd_screen_stocks("${key}") 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { stocks: out, method: "ffd_screen_stocks" };
}

export function decideMapStatus(concept: ChokePointConcept, candidates: Candidate[]): ChokePointMapStatus {
  if (candidates.length === 0) {
    return concept.chinaSubstituteStatus === "no-domestic-equivalent" ? "no-equivalent" : "unverifiable";
  }
  if (concept.chinaSubstituteStatus === "no-domestic-equivalent") return "domestic-substitution-play";
  const themeLinked = candidates.some((candidate) =>
    candidate.matchedThemes.some((theme) => concept.matchedThemeIds.includes(theme.themeId)),
  );
  return themeLinked && candidates.length >= MIN_CONSTITUENTS_FOR_CLEAN ? "clean-equivalent" : "partial-overlap";
}

/** Geopolitics is SURFACED only; it never enters scoreCandidate. */
export function geopoliticalNotes(concept: ChokePointConcept): string[] {
  switch (concept.chinaSubstituteStatus) {
    case "established-domestic":
      return ["国产替代成熟度溢价：供应安全溢价适用，但需用本地订单/产能/客户验证落地，不计入产业逻辑评分。"];
    case "no-domestic-equivalent":
      return ["出口管制/制裁风险折扣：无成熟国产替代，海外断供或管制为下行风险；不计入产业逻辑评分，仅作风险提示。"];
    case "overcrowded-domestic":
      return ["国产供应商拥挤：增量可能已被定价，需新订单/价格/产能证据，不自动作为利空。"];
    default:
      return ["国产替代处于早期：关注政策、客户导入与产能释放节奏；溢价/折扣仅作风险提示。"];
  }
}

/** Research directions a US/HK thesis spawns; never buy/sell instructions. */
export function lineOfInquiryFor(concept: ChokePointConcept, mapStatus: ChokePointMapStatus): string[] {
  const base = [
    `核验 ${concept.nameZh} 卡点是否真实存在：用 A 股公司公告、年报、互动易确认客户导入、产能与良率。`,
    `拆解需求量 -> 供给量 -> 缺口 -> 价格 -> 单位利润 -> 公司弹性，缺任一环节进入覆盖缺口。`,
    `Serenity 的 ${concept.globalExample ?? "海外标的"} 结论仅作研究方向，不作为 A 股证据或买卖理由。`,
  ];
  if (mapStatus === "no-equivalent" || mapStatus === "unverifiable") {
    base.push("当前无干净 A 股对应：报告结构性缺口，不要硬凑标的；持续跟踪潜在国产替代进入者。");
  }
  if (mapStatus === "domestic-substitution-play") {
    base.push("作为国产替代机会评估：核验政策背书、客户验证、产能爬坡与海外管制的双向影响。");
  }
  return base;
}

/** Partition sources around a candidate. Serenity material can NEVER land in candidateLevelP0. */
export function buildChokePointProvenance(
  candidate: Candidate,
  concept: ChokePointConcept,
  allSources: SourceRecord[],
  mapStatus: ChokePointMapStatus,
): ChokePointProvenance {
  const relevant = relevantSourcesForCandidate(candidate.stock, allSources, candidate.matchedThemes);
  const candidateLevelP0 = relevant.filter(
    (source) => isCandidateSpecificPrimarySource(source, candidate) && !isSerenityFrameworkSource(source),
  );
  const corroboratingAShareSources = relevant.filter(
    (source) => (source.tier === "P1" || source.tier === "P2") && !isSerenityFrameworkSource(source),
  );
  const serenityContext = allSources.filter(
    (source) => concept.serenitySourceIds.includes(source.id) || isSerenityFrameworkSource(source),
  );
  const confidenceAdjustment =
    candidateLevelP0.length === 0
      ? "需补齐候选级 P0（公告/年报/互动易）后才能升级置信度；Serenity 论点仅为研究方向。"
      : corroboratingAShareSources.length === 0
        ? "建议补独立 A 股 P1（卖方/产业研报）以达到中高置信度。"
        : "";
  return {
    candidateCode: candidate.stock.code,
    candidateName: candidate.stock.name,
    conceptId: concept.id,
    globalExample: concept.globalExample,
    mapStatus,
    geopoliticalPolarity: concept.geopoliticalPolarity,
    candidateLevelP0,
    corroboratingAShareSources,
    serenityContext,
    geopoliticalNotes: geopoliticalNotes(concept),
    confidenceAdjustment,
  };
}

export async function resolveConceptToAShares(
  concept: ChokePointConcept,
  sources: SourceRecord[],
  maxResults = 20,
): Promise<ChokePointResolution> {
  const gaps: string[] = [];
  const { stocks, method } = await resolveConstituents(concept, gaps);

  // UNCHANGED, synchronous scoring path. Serenity sources are passed through but
  // cannot become candidate-level evidence: relevantSourcesForCandidate filters them
  // from the scoring set, and extractCandidateEvidence filters them from
  // structuredEvidence / the graph / the corroboration gate.
  const candidates = stocks
    .map((stock) => scoreCandidate(stock, sources))
    .filter((candidate) => candidate.matchedThemes.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const mapStatus = decideMapStatus(concept, candidates);
  if (candidates.length === 0) {
    gaps.push(`概念 "${concept.nameZh}" 未解析到 A 股标的（mapStatus=${mapStatus}）；可能无干净 A 股对应或 FFD 数据缺失。`);
  }
  return {
    conceptId: concept.id,
    conceptNameZh: concept.nameZh,
    resolutionMethod: stocks.length === 0 ? "static-universe" : method,
    resolutionQuery: concept.aShareIndustryKeywords.join(" / "),
    mapStatus,
    lineOfInquiry: lineOfInquiryFor(concept, mapStatus),
    candidates,
    provenance: candidates.map((candidate) => buildChokePointProvenance(candidate, concept, sources, mapStatus)),
    resolutionGaps: gaps,
    resolutionTimestamp: new Date().toISOString(),
  };
}

export function getConcept(conceptId: string): ChokePointConcept | undefined {
  return SERENITY_DERIVED_CONCEPTS.find((concept) => concept.id === conceptId);
}
