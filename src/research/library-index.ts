import { createHash } from "node:crypto";
import path from "node:path";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";
import type { EmbeddingClient } from "./embeddings.js";
import { buildLibrarySearchIndex, type LibrarySearchIndex } from "./library-search.js";

// P0-2: persistent embedding index over library chunks. Brute-force cosine over a few
// thousand vectors is milliseconds — no native vector store, no extra daemon, one JSON
// file. Incremental: chunks are keyed by content hash, so a rebuild only embeds what
// changed since the last run.

export const EMBEDDING_INDEX_PATH = path.resolve("data/library-index/embeddings.json");

export interface EmbeddingRecord {
  key: string; // `${reportId}:${chunkId}`
  hash: string;
  vector: number[];
}

export interface EmbeddingIndexFile {
  model: string;
  dim: number;
  builtAt: string;
  records: EmbeddingRecord[];
}

export interface EmbeddingBuildStats {
  totalChunks: number;
  embedded: number;
  reused: number;
  pruned: number;
  model: string;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 24);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function roundVector(vector: number[]): number[] {
  return vector.map((value) => Number(value.toFixed(5)));
}

export async function loadEmbeddingIndex(filePath = EMBEDDING_INDEX_PATH): Promise<EmbeddingIndexFile | null> {
  const file = await readJsonFile<EmbeddingIndexFile | null>(filePath, null);
  if (!file || !Array.isArray(file.records) || file.records.length === 0) return null;
  return file;
}

export async function buildEmbeddingIndex(
  client: EmbeddingClient,
  options: { searchIndex?: LibrarySearchIndex; filePath?: string; batchSize?: number; includeStaged?: boolean } = {},
): Promise<EmbeddingBuildStats> {
  const filePath = options.filePath ?? EMBEDDING_INDEX_PATH;
  const batchSize = options.batchSize ?? 16;
  const searchIndex = options.searchIndex ?? (await buildLibrarySearchIndex({ includeStaged: options.includeStaged }));
  const existing = await readJsonFile<EmbeddingIndexFile | null>(filePath, null);
  const existingByKey = new Map((existing?.records ?? []).map((record) => [record.key, record]));
  const sameModel = existing?.model === client.label;

  const targets = searchIndex.documents.map((indexed) => ({
    key: `${indexed.document.reportId}:${indexed.document.chunkId}`,
    hash: contentHash(indexed.document.text),
    text: `${indexed.document.title}\n${indexed.document.text}`.slice(0, 6000),
  }));

  const records: EmbeddingRecord[] = [];
  const pending: Array<{ key: string; hash: string; text: string }> = [];
  let reused = 0;
  for (const target of targets) {
    const previous = sameModel ? existingByKey.get(target.key) : undefined;
    if (previous && previous.hash === target.hash) {
      records.push(previous);
      reused += 1;
    } else {
      pending.push(target);
    }
  }

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const vectors = await client.embed(batch.map((item) => item.text));
    batch.forEach((item, position) => {
      records.push({ key: item.key, hash: item.hash, vector: roundVector(vectors[position] ?? []) });
    });
  }

  const targetKeys = new Set(targets.map((target) => target.key));
  const pruned = (existing?.records ?? []).filter((record) => !targetKeys.has(record.key)).length;

  const file: EmbeddingIndexFile = {
    model: client.label,
    dim: client.dim,
    builtAt: new Date().toISOString(),
    records,
  };
  await writeJsonFile(filePath, file);
  return { totalChunks: targets.length, embedded: pending.length, reused, pruned, model: client.label };
}

export interface VectorHit {
  key: string;
  similarity: number;
}

export function vectorSearch(index: EmbeddingIndexFile, queryVector: number[], topK: number): VectorHit[] {
  const hits: VectorHit[] = index.records.map((record) => ({
    key: record.key,
    similarity: cosineSimilarity(record.vector, queryVector),
  }));
  return hits.sort((a, b) => b.similarity - a.similarity || a.key.localeCompare(b.key)).slice(0, topK);
}

// Reciprocal Rank Fusion: robust fusion without score normalization headaches.
const RRF_K = 60;

export function fuseRrf(rankings: Array<Map<string, number>>): Map<string, number> {
  const fused = new Map<string, number>();
  for (const ranking of rankings) {
    for (const [key, rank] of ranking) {
      fused.set(key, (fused.get(key) ?? 0) + 1 / (RRF_K + rank));
    }
  }
  return fused;
}
