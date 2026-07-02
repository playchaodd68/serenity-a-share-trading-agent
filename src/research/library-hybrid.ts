import { resolveEmbeddingRuntime, type EmbeddingClient } from "./embeddings.js";
import { obsidianUriForPath } from "./obsidian-link.js";
import { fuseRrf, loadEmbeddingIndex, vectorSearch, type EmbeddingIndexFile } from "./library-index.js";
import {
  getLibrarySearchIndex,
  scoreBm25,
  type LibrarySearchFilters,
  type LibrarySearchIndex,
  type LibrarySearchResult,
} from "./library-search.js";

// P0-2 entry point: hybrid retrieval = BM25 ∪ dense (bge-m3) fused with RRF, then the
// same metadata filters and duplicate-title budgeting as the lexical path. Degrades to
// lexical-only (with an explicit mode marker) when the embedding index or Ollama is
// missing — never fails the query because a daemon is down.

export type LibraryRetrievalMode = "hybrid" | "lexical-only";

export interface HybridSearchOutput {
  mode: LibraryRetrievalMode;
  results: LibrarySearchResult[];
  reportCount: number;
  note?: string;
}

const CANDIDATE_POOL = 50;

function selectWithFilters(
  ranked: LibrarySearchResult[],
  filters: LibrarySearchFilters,
): LibrarySearchResult[] {
  const topK = filters.topK ?? 8;
  const maxPerReport = filters.maxChunksPerReport ?? 2;
  const normalizeTitle = (title: string) => title.replace(/[\s\d\-—【】\[\]()（）.]/g, "");
  const perReport = new Map<string, number>();
  const selected: LibrarySearchResult[] = [];
  for (const result of ranked) {
    const doc = result.document;
    if (filters.company && !doc.companies.some((company) => company.includes(filters.company!)) && !doc.text.includes(filters.company)) continue;
    if (filters.topic && !doc.topics.some((topic) => topic.includes(filters.topic!))) continue;
    if (filters.institution && !(doc.institution ?? "").includes(filters.institution)) continue;
    const reportKey = normalizeTitle(doc.title) || doc.reportId;
    const count = perReport.get(reportKey) ?? 0;
    if (count >= maxPerReport) continue;
    perReport.set(reportKey, count + 1);
    selected.push(result);
    if (selected.length >= topK) break;
  }
  return selected;
}

export interface HybridDependencies {
  embeddingClient?: EmbeddingClient;
  embeddingIndex?: EmbeddingIndexFile | null;
  searchIndex?: LibrarySearchIndex;
  ollamaAvailable?: boolean;
}

export async function hybridSearchReportLibrary(
  query: string,
  filters: LibrarySearchFilters = {},
  deps: HybridDependencies = {},
): Promise<HybridSearchOutput> {
  const searchIndex = deps.searchIndex ?? (await getLibrarySearchIndex({ includeStaged: filters.includeStaged }));
  const lexical = scoreBm25(searchIndex, query).slice(0, CANDIDATE_POOL);

  const embeddingIndex = deps.embeddingIndex !== undefined ? deps.embeddingIndex : await loadEmbeddingIndex();
  let client = deps.embeddingClient ?? null;
  let unavailableReason: string | undefined;
  if (embeddingIndex && client == null) {
    const runtime = await resolveEmbeddingRuntime();
    client = runtime.client;
    unavailableReason = runtime.reason;
  }

  if (!embeddingIndex || client == null) {
    return {
      mode: "lexical-only",
      results: selectWithFilters(lexical, filters),
      reportCount: searchIndex.reportCount,
      note: !embeddingIndex
        ? "未找到向量索引（先运行 npm run library:embed）。"
        : `向量后端不可用（${unavailableReason ?? "unknown"}），本次退化为词法检索。`,
    };
  }
  let queryVector: number[];
  try {
    [queryVector] = await client.embed([query]);
  } catch (error) {
    return {
      mode: "lexical-only",
      results: selectWithFilters(lexical, filters),
      reportCount: searchIndex.reportCount,
      note: `查询向量化失败（${error instanceof Error ? error.message : String(error)}），退化为词法检索。`,
    };
  }

  const dense = vectorSearch(embeddingIndex, queryVector, CANDIDATE_POOL);
  const lexicalRanks = new Map(lexical.map((result, index) => [`${result.document.reportId}:${result.document.chunkId}`, index + 1]));
  const denseRanks = new Map(dense.map((hit, index) => [hit.key, index + 1]));
  const fused = fuseRrf([lexicalRanks, denseRanks]);

  const documentByKey = new Map(
    searchIndex.documents.map((indexed) => [`${indexed.document.reportId}:${indexed.document.chunkId}`, indexed.document]),
  );
  const ranked: LibrarySearchResult[] = [...fused.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, score]) => {
      const document = documentByKey.get(key);
      return document ? { document, score: Number(score.toFixed(5)) } : null;
    })
    .filter((result): result is LibrarySearchResult => result != null);

  return { mode: "hybrid", results: selectWithFilters(ranked, filters), reportCount: searchIndex.reportCount };
}

export function renderHybridResults(query: string, output: HybridSearchOutput): string {
  const header =
    output.results.length === 0
      ? `本地研报库未命中「${query}」（已索引 ${output.reportCount} 篇；模式 ${output.mode}）。`
      : `本地研报库检索「${query}」：命中 ${output.results.length} 段（模式 ${output.mode}，已索引 ${output.reportCount} 篇）`;
  const lines = [header];
  if (output.note) lines.push(`> ${output.note}`);
  if (output.results.length > 0) {
    lines.push("> 以下均为 P1 卖方研报观点，未经候选级 P0 验证，不得作为高置信结论的主证据。", "");
    output.results.forEach((result, position) => {
      const doc = result.document;
      const excerpt = doc.text.replace(/\s+/g, " ").slice(0, 160);
      lines.push(
        `${position + 1}. [${doc.sourceRecordId}] ${doc.title}`,
        `   机构：${doc.institution ?? "未知"}；日期：${doc.publishedAt ?? "未知"}；段落：${doc.sectionTitle ?? "全文"}；score ${result.score}`,
        `   ${excerpt}${doc.text.length > 160 ? "…" : ""}`,
      );
      const noteUri = doc.notePath ? obsidianUriForPath(doc.notePath) : null;
      if (noteUri) lines.push(`   打开笔记：${noteUri}`);
      if (doc.rawPath) lines.push(`   原始文件：${doc.rawPath}`);
    });
  }
  return lines.join("\n");
}
