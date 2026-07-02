import path from "node:path";
import { getConfig } from "../config.js";
import { readJsonFile } from "../utils/fs.js";
import { listFfdReportManifests, type FfdReportChunk, type FfdReportManifest } from "./report-library.js";

// P0-1 of the RAG upgrade: local retrieval over the accepted broker-report library.
// Lexical BM25 with CJK bigram tokenization — zero dependencies, deterministic, and the
// substrate the hybrid (embedding) layer fuses with in P0-2. Every result carries its
// provenance: report/source ID, tier (P1), and the requiresP0Verification flag, so
// downstream prompts can never launder a broker opinion into primary evidence.

export interface LibraryDocument {
  reportId: string;
  sourceRecordId: string;
  chunkId: string;
  title: string;
  institution?: string;
  publishedAt?: string;
  status: string;
  text: string;
  sectionTitle?: string;
  topics: string[];
  companies: string[];
  sourceTier: "P1";
  requiresP0Verification: boolean;
  tokenEstimate: number;
}

export interface LibrarySearchResult {
  document: LibraryDocument;
  score: number;
}

export interface LibrarySearchFilters {
  topK?: number;
  includeStaged?: boolean;
  company?: string;
  topic?: string;
  institution?: string;
  maxChunksPerReport?: number;
}

const CJK_PATTERN = /[一-鿿]/;
const MIN_CHUNK_TOKENS = 12;
const DEFAULT_TOP_K = 8;
const DEFAULT_MAX_CHUNKS_PER_REPORT = 2;
const BM25_K1 = 1.5;
const BM25_B = 0.75;

// CJK-aware tokenizer: latin/digit runs stay whole words; CJK runs become sliding
// bigrams (plus a unigram for isolated single characters). No segmenter dependency.
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const normalized = text.toLowerCase();
  const pattern = /[a-z0-9]+(?:[.-][a-z0-9]+)*|[一-鿿]+/g;
  for (const match of normalized.matchAll(pattern)) {
    const run = match[0];
    if (!CJK_PATTERN.test(run)) {
      tokens.push(run);
      continue;
    }
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.push(run.slice(index, index + 2));
    }
  }
  return tokens;
}

interface IndexedDocument {
  document: LibraryDocument;
  termFrequencies: Map<string, number>;
  length: number;
}

export interface LibrarySearchIndex {
  builtAt: string;
  documents: IndexedDocument[];
  documentFrequency: Map<string, number>;
  averageLength: number;
  reportCount: number;
}

function toDocuments(manifest: FfdReportManifest, chunks: FfdReportChunk[]): LibraryDocument[] {
  return chunks
    .filter((chunk) => chunk.tokenEstimate >= MIN_CHUNK_TOKENS)
    .map((chunk) => ({
      reportId: manifest.id,
      sourceRecordId: (manifest as { sourceRecordId?: string }).sourceRecordId ?? manifest.id,
      chunkId: chunk.id,
      title: manifest.title,
      institution: manifest.institution,
      publishedAt: manifest.publishedAt,
      status: manifest.status,
      text: chunk.text,
      sectionTitle: chunk.sectionTitle,
      topics: chunk.topics ?? [],
      companies: chunk.companies ?? [],
      sourceTier: "P1" as const,
      requiresP0Verification: chunk.requiresP0Verification ?? true,
      tokenEstimate: chunk.tokenEstimate,
    }));
}

export async function buildLibrarySearchIndex(options: { processedDir?: string; includeStaged?: boolean } = {}): Promise<LibrarySearchIndex> {
  const processedDir = options.processedDir ? path.resolve(options.processedDir) : path.resolve(getConfig().ffdReportProcessedDir);
  const manifests = await listFfdReportManifests(processedDir);
  const eligible = manifests.filter((manifest) =>
    options.includeStaged ? manifest.status === "accepted" || manifest.status === "staged" : manifest.status === "accepted",
  );

  const documents: IndexedDocument[] = [];
  const documentFrequency = new Map<string, number>();
  for (const manifest of eligible) {
    const chunks = await readJsonFile<FfdReportChunk[]>(manifest.chunksPath, []);
    for (const document of toDocuments(manifest, chunks)) {
      const tokens = tokenize(`${document.title}\n${document.sectionTitle ?? ""}\n${document.text}`);
      const termFrequencies = new Map<string, number>();
      for (const token of tokens) termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
      for (const term of termFrequencies.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
      documents.push({ document, termFrequencies, length: tokens.length });
    }
  }
  const averageLength = documents.length === 0 ? 0 : documents.reduce((sum, doc) => sum + doc.length, 0) / documents.length;
  return {
    builtAt: new Date().toISOString(),
    documents,
    documentFrequency,
    averageLength,
    reportCount: eligible.length,
  };
}

// Simple in-process cache: the library changes at most a few times a day.
let cachedIndex: LibrarySearchIndex | null = null;
let cachedKey = "";
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getLibrarySearchIndex(options: { processedDir?: string; includeStaged?: boolean; forceRebuild?: boolean } = {}): Promise<LibrarySearchIndex> {
  const key = `${options.processedDir ?? "default"}:${options.includeStaged ? "all" : "accepted"}`;
  if (
    !options.forceRebuild &&
    cachedIndex &&
    cachedKey === key &&
    Date.now() - Date.parse(cachedIndex.builtAt) < CACHE_TTL_MS
  ) {
    return cachedIndex;
  }
  cachedIndex = await buildLibrarySearchIndex(options);
  cachedKey = key;
  return cachedIndex;
}

export function scoreBm25(index: LibrarySearchIndex, query: string): LibrarySearchResult[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || index.documents.length === 0) return [];
  const totalDocs = index.documents.length;
  const results: LibrarySearchResult[] = [];
  for (const indexed of index.documents) {
    let score = 0;
    for (const term of queryTerms) {
      const tf = indexed.termFrequencies.get(term) ?? 0;
      if (tf === 0) continue;
      const df = index.documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
      const denominator = tf + BM25_K1 * (1 - BM25_B + (BM25_B * indexed.length) / Math.max(index.averageLength, 1));
      score += idf * ((tf * (BM25_K1 + 1)) / denominator);
    }
    if (score > 0) results.push({ document: indexed.document, score: Number(score.toFixed(4)) });
  }
  return results.sort((a, b) => b.score - a.score || a.document.chunkId.localeCompare(b.document.chunkId));
}

function matchesFilters(document: LibraryDocument, filters: LibrarySearchFilters): boolean {
  if (filters.company && !document.companies.some((company) => company.includes(filters.company!)) && !document.text.includes(filters.company)) {
    return false;
  }
  if (filters.topic && !document.topics.some((topic) => topic.includes(filters.topic!))) return false;
  if (filters.institution && !(document.institution ?? "").includes(filters.institution)) return false;
  return true;
}

export async function searchReportLibrary(query: string, filters: LibrarySearchFilters = {}): Promise<LibrarySearchResult[]> {
  const index = await getLibrarySearchIndex({ includeStaged: filters.includeStaged });
  const topK = filters.topK ?? DEFAULT_TOP_K;
  const maxPerReport = filters.maxChunksPerReport ?? DEFAULT_MAX_CHUNKS_PER_REPORT;
  const perReport = new Map<string, number>();
  const selected: LibrarySearchResult[] = [];
  const normalizeTitle = (title: string) => title.replace(/[\s\d\-—【】\[\]()（）.]/g, "");
  for (const result of scoreBm25(index, query)) {
    if (!matchesFilters(result.document, filters)) continue;
    // Duplicate downloads of the same report carry different IDs but near-identical
    // titles; budget them as one report so one document cannot crowd the results.
    const reportKey = normalizeTitle(result.document.title) || result.document.reportId;
    const count = perReport.get(reportKey) ?? 0;
    if (count >= maxPerReport) continue;
    perReport.set(reportKey, count + 1);
    selected.push(result);
    if (selected.length >= topK) break;
  }
  return selected;
}

export function renderLibrarySearchResults(query: string, results: LibrarySearchResult[], index?: { reportCount: number }): string {
  if (results.length === 0) {
    return `本地研报库未命中「${query}」${index ? `（已索引 ${index.reportCount} 篇已接受研报）` : ""}。可尝试更换关键词，或先运行 reports:accept-quality 扩充库。`;
  }
  const lines = [
    `本地研报库检索「${query}」：命中 ${results.length} 段`,
    "> 以下均为 P1 卖方研报观点，未经候选级 P0 验证，不得作为高置信结论的主证据。",
    "",
  ];
  results.forEach((result, position) => {
    const doc = result.document;
    const excerpt = doc.text.replace(/\s+/g, " ").slice(0, 160);
    lines.push(
      `${position + 1}. [${doc.sourceRecordId}] ${doc.title}`,
      `   机构：${doc.institution ?? "未知"}；日期：${doc.publishedAt ?? "未知"}；段落：${doc.sectionTitle ?? "全文"}；BM25 ${result.score}`,
      `   ${excerpt}${doc.text.length > 160 ? "…" : ""}`,
    );
  });
  return lines.join("\n");
}
