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
