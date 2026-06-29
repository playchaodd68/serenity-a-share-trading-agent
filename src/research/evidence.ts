import type { Candidate, EvidencePolarity, EvidenceSummary, ResearchEvidence, ResearchEvidenceKind, SourceRecord } from "../types.js";
import { isSerenityFrameworkSource } from "../sources/serenity-boundary.js";

const POSITIVE_TERMS = ["客户", "订单", "验证", "产能", "扩产", "放量", "良率", "国产替代", "定点", "披露", "公告", "年报"];
const RISK_TERMS = ["风险", "不及预期", "替代", "自研", "价格战", "制裁", "库存", "拥挤", "降价", "路线切换", "稀释"];
const RELATION_TERMS = ["客户", "订单", "供应", "供应商", "产能", "良率", "扩产", "验证", "定点"];

function normalize(value: string): string {
  return value.toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sourceText(source: SourceRecord): string {
  return normalize([source.id, source.title, source.publisher, source.summary, ...source.evidenceTags].join(" "));
}

function candidateTerms(candidate: Candidate): string[] {
  return unique([
    candidate.stock.code,
    candidate.stock.name,
    candidate.stock.industry,
    candidate.stock.region,
    ...candidate.stock.concept.split(/\s+/),
    ...candidate.matchedThemes.flatMap((theme) => [theme.themeId, theme.label, ...theme.keywords]),
  ]).filter((term) => term.length >= 2);
}

function sourceMentionsAny(source: SourceRecord, terms: string[]): boolean {
  const haystack = sourceText(source);
  return terms.some((term) => haystack.includes(normalize(term)));
}

function sourceMentionsCandidateIdentity(source: SourceRecord, candidate: Candidate): boolean {
  const haystack = sourceText(source);
  return [candidate.stock.code, candidate.stock.name].some((term) => term.trim().length >= 2 && haystack.includes(normalize(term)));
}

export function isCandidateSpecificPrimarySource(source: SourceRecord, candidate: Candidate): boolean {
  return source.tier === "P0" && source.sourceType === "primary" && sourceMentionsCandidateIdentity(source, candidate);
}

function inferKind(source: SourceRecord, candidate: Candidate): ResearchEvidenceKind {
  if (source.sourceType === "primary") return isCandidateSpecificPrimarySource(source, candidate) ? "primary-filing" : "framework-inference";
  if (source.sourceType === "broker_report") return "broker-report";
  if (source.id === "EASTMONEY-A-SHARE-SNAPSHOT") return "market-signal";
  if (source.sourceType === "industry" || source.sourceType === "local_file") return "industry-signal";
  return "framework-inference";
}

function inferPolarity(source: SourceRecord, candidate: Candidate): EvidencePolarity {
  const haystack = sourceText(source);
  const positiveTerms = unique([...POSITIVE_TERMS, ...candidate.matchedThemes.flatMap((theme) => theme.keywords)]);
  const negativeTerms = unique([...RISK_TERMS]);
  const positiveHits = positiveTerms.filter((term) => haystack.includes(normalize(term))).length;
  const negativeHits = negativeTerms.filter((term) => haystack.includes(normalize(term))).length;
  if (negativeHits > positiveHits) return "negative";
  if (positiveHits > 0) return "positive";
  return "neutral";
}

function confidenceFor(source: SourceRecord, direct: boolean, polarity: EvidencePolarity): number {
  const base = source.tier === "P0" ? 78 : source.tier === "P1" ? 62 : 42;
  const directBoost = direct ? 12 : 0;
  const polarityPenalty = polarity === "negative" ? 4 : 0;
  const registryPenalty = source.evidenceTags.includes("primary-registry") && !direct ? 28 : 0;
  return Math.max(15, Math.min(95, base + directBoost - polarityPenalty - registryPenalty));
}

function snippetFor(source: SourceRecord, candidate: Candidate, direct: boolean): string {
  const prefix = direct ? `${candidate.stock.code} ${candidate.stock.name}: ` : "";
  const snippet = source.summary.trim() || source.title.trim();
  return `${prefix}${snippet}`.slice(0, 260);
}

function evidenceId(candidate: Candidate, source: SourceRecord, index: number): string {
  return `REV-${candidate.stock.code}-${index + 1}-${source.id}`.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 160);
}

export function extractCandidateEvidence(candidate: Candidate, sources: SourceRecord[], now = new Date().toISOString()): ResearchEvidence[] {
  const terms = candidateTerms(candidate);
  // Serenity-derived framework/social sources are research lines of inquiry only and
  // must never become candidate-level evidence — keep them out of structuredEvidence,
  // the supply-chain graph, and the hasIndependentCorroboration / hasCandidateP0 gate.
  return sources
    .filter((source) => !isSerenityFrameworkSource(source))
    .map((source, index) => {
      const direct = sourceMentionsCandidateIdentity(source, candidate);
      const companySpecificSource = source.evidenceTags.includes("candidate-direct") || source.sourceType === "broker_report";
      if (companySpecificSource && !direct && !source.evidenceTags.includes("sector-report")) return null;
      const matches = direct || sourceMentionsAny(source, terms) || sourceMentionsAny(source, [...POSITIVE_TERMS, ...RISK_TERMS]);
      if (!matches) return null;
      const polarity = inferPolarity(source, candidate);
      const inferredKind = inferKind(source, candidate);
      const kind = polarity === "negative" && inferredKind !== "primary-filing" ? "risk" : inferredKind;
      return {
        id: evidenceId(candidate, source, index),
        candidateCode: candidate.stock.code,
        candidateName: candidate.stock.name,
        sourceId: source.id,
        tier: source.tier,
        kind,
        polarity,
        confidence: confidenceFor(source, direct, polarity),
        title: source.title,
        snippet: snippetFor(source, candidate, direct),
        tags: unique([
          ...source.evidenceTags,
          ...RELATION_TERMS.filter((term) => sourceText(source).includes(normalize(term))),
          ...candidate.matchedThemes.flatMap((theme) => theme.keywords).filter((term) => sourceText(source).includes(normalize(term))),
          kind,
          direct ? "candidate-direct" : "indirect",
        ]),
        direct,
        observedAt: source.observedAt || now,
      } satisfies ResearchEvidence;
    })
    .filter((item): item is ResearchEvidence => item != null)
    .sort((a, b) => b.confidence - a.confidence || a.sourceId.localeCompare(b.sourceId));
}

export function summarizeEvidence(evidence: ResearchEvidence[]): EvidenceSummary {
  const direct = evidence.filter((item) => item.direct);
  const risks = evidence.filter((item) => item.polarity === "negative" || item.kind === "risk");
  const corroborating = evidence.filter((item) => !item.direct && item.polarity !== "negative");
  const hasCandidateP0 = direct.some((item) => item.tier === "P0" && item.kind === "primary-filing");
  const strongest = [...evidence].sort((a, b) => b.confidence - a.confidence || a.sourceId.localeCompare(b.sourceId)).slice(0, 5);
  const nextActions = [
    ...(hasCandidateP0 ? [] : ["补齐候选公司级 P0：年报、公告、互动问答或监管披露中的具体公司记录。"]),
    ...(corroborating.some((item) => item.kind === "broker-report") ? [] : ["补齐授权卖方研报或本地研报文件，验证产业链位置和客户/产能表述。"]),
    ...(risks.length > 0 ? ["复核负面证据：替代路线、客户自研、价格战、制裁或估值拥挤。"] : ["主动搜索反证：替代供应、客户自研、技术路线切换和竞争扩产。"]),
  ];
  return { direct, corroborating, risks, strongest, hasCandidateP0, nextActions };
}
