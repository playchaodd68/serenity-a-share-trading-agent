// P0-2: embedding client for the hybrid retrieval layer. Ollama + bge-m3 runs fully
// local (research corpus never leaves the machine). Injectable interface so tests use a
// deterministic fake and retrieval degrades gracefully to lexical-only when Ollama is
// down — availability of a daemon must never break the research pipeline.

export interface EmbeddingClient {
  label: string;
  dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "bge-m3";
const EMBED_TIMEOUT_MS = 120_000;

export interface OllamaEmbeddingOptions {
  baseUrl?: string;
  model?: string;
  dim?: number;
}

export async function isOllamaAvailable(baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export function createOllamaEmbeddingClient(options: OllamaEmbeddingOptions = {}): EmbeddingClient {
  const baseUrl = (options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, "");
  const model = options.model ?? process.env.LIBRARY_EMBEDDING_MODEL ?? DEFAULT_MODEL;
  return {
    label: `ollama/${model}`,
    dim: options.dim ?? 1024,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
      try {
        const response = await fetch(`${baseUrl}/api/embed`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, input: texts }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Ollama embed failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
        }
        const payload = (await response.json()) as { embeddings?: number[][] };
        if (!payload.embeddings || payload.embeddings.length !== texts.length) {
          throw new Error("Ollama embed returned a mismatched embeddings array.");
        }
        return payload.embeddings;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// --- SiliconFlow (OpenAI-compatible) provider -----------------------------------------
// Preferred when SILICONFLOW_API_KEY is configured: Qwen3-Embedding-8B tops multilingual
// retrieval benchmarks and supports matryoshka output dims, so we keep 1024-dim parity
// with the local bge-m3 index (same brute-force cost, better vectors).

const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const SILICONFLOW_DEFAULT_MODEL = "Qwen/Qwen3-Embedding-8B";
const SILICONFLOW_DEFAULT_DIM = 1024;

export interface SiliconFlowEmbeddingOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dim?: number;
}

export function createSiliconFlowEmbeddingClient(options: SiliconFlowEmbeddingOptions = {}): EmbeddingClient {
  const apiKey = options.apiKey ?? process.env.SILICONFLOW_API_KEY;
  const baseUrl = (options.baseUrl ?? process.env.SILICONFLOW_BASE_URL ?? SILICONFLOW_BASE_URL).replace(/\/+$/, "");
  const model = options.model ?? process.env.LIBRARY_EMBEDDING_MODEL ?? SILICONFLOW_DEFAULT_MODEL;
  const dim = options.dim ?? SILICONFLOW_DEFAULT_DIM;
  const supportsCustomDim = model.includes("Qwen3-Embedding");
  return {
    label: `siliconflow/${model}@${supportsCustomDim ? dim : "native"}`,
    dim,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      if (!apiKey) throw new Error("SILICONFLOW_API_KEY is not configured.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
      try {
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            input: texts,
            encoding_format: "float",
            ...(supportsCustomDim ? { dimensions: dim } : {}),
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`SiliconFlow embed failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
        }
        const payload = (await response.json()) as { data?: Array<{ index: number; embedding: number[] }> };
        if (!payload.data || payload.data.length !== texts.length) {
          throw new Error("SiliconFlow embed returned a mismatched data array.");
        }
        return [...payload.data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// --- provider resolution ---------------------------------------------------------------
// Priority: SiliconFlow API (key present) -> local Ollama -> none (lexical-only search).

export interface EmbeddingRuntime {
  client: EmbeddingClient | null;
  provider: "siliconflow" | "ollama" | "none";
  reason?: string;
}

export async function resolveEmbeddingRuntime(): Promise<EmbeddingRuntime> {
  const forced = process.env.LIBRARY_EMBEDDING_PROVIDER;
  if (forced === "ollama") {
    if (await isOllamaAvailable()) return { client: createOllamaEmbeddingClient(), provider: "ollama" };
    return { client: null, provider: "none", reason: "LIBRARY_EMBEDDING_PROVIDER=ollama 但 Ollama 未运行。" };
  }
  if (forced === "siliconflow" || process.env.SILICONFLOW_API_KEY) {
    if (process.env.SILICONFLOW_API_KEY) return { client: createSiliconFlowEmbeddingClient(), provider: "siliconflow" };
    return { client: null, provider: "none", reason: "LIBRARY_EMBEDDING_PROVIDER=siliconflow 但缺 SILICONFLOW_API_KEY。" };
  }
  if (await isOllamaAvailable()) return { client: createOllamaEmbeddingClient(), provider: "ollama" };
  return { client: null, provider: "none", reason: "未配置 SILICONFLOW_API_KEY 且 Ollama 未运行。" };
}
