// C-layer: cross-encoder reranking over the fused candidate pool. SiliconFlow /v1/rerank
// with Qwen3-Reranker-8B; injectable interface, deterministic fake in tests, and a
// best-effort contract — a rerank failure silently keeps the RRF order.

export interface RerankResultItem {
  index: number;
  relevanceScore: number;
}

export interface RerankerClient {
  label: string;
  rerank(query: string, documents: string[], topN: number): Promise<RerankResultItem[]>;
}

const SILICONFLOW_RERANK_URL = "https://api.siliconflow.cn/v1/rerank";
const DEFAULT_RERANK_MODEL = "BAAI/bge-reranker-v2-m3";
const RERANK_TIMEOUT_MS = 60_000;

export function createSiliconFlowReranker(options: { apiKey?: string; model?: string } = {}): RerankerClient | null {
  const apiKey = options.apiKey ?? process.env.SILICONFLOW_API_KEY;
  if (!apiKey) return null;
  const model = options.model ?? process.env.LIBRARY_RERANKER_MODEL ?? DEFAULT_RERANK_MODEL;
  if (model === "off") return null;
  return {
    label: `siliconflow/${model}`,
    async rerank(query: string, documents: string[], topN: number): Promise<RerankResultItem[]> {
      if (documents.length === 0) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS);
      try {
        const response = await fetch(SILICONFLOW_RERANK_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, query, documents, top_n: Math.min(topN, documents.length) }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`rerank failed: ${response.status} ${(await response.text()).slice(0, 160)}`);
        const payload = (await response.json()) as { results?: Array<{ index: number; relevance_score: number }> };
        return (payload.results ?? []).map((item) => ({ index: item.index, relevanceScore: item.relevance_score }));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
