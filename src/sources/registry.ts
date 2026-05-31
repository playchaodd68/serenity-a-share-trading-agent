import path from "node:path";
import type { SourceRecord } from "../types.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";
import { SEED_SOURCES } from "./seed.js";

export const SOURCE_REGISTRY_PATH = path.resolve("data/source-registry.json");

export function mergeSources(existing: SourceRecord[], incoming: SourceRecord[]): SourceRecord[] {
  const byId = new Map<string, SourceRecord>();
  for (const source of [...existing, ...incoming]) {
    const previous = byId.get(source.id);
    byId.set(source.id, previous ? { ...previous, ...source, evidenceTags: [...new Set([...previous.evidenceTags, ...source.evidenceTags])] } : source);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadSourceRegistry(filePath = SOURCE_REGISTRY_PATH): Promise<SourceRecord[]> {
  return readJsonFile<SourceRecord[]>(filePath, []);
}

export async function saveSourceRegistry(sources: SourceRecord[], filePath = SOURCE_REGISTRY_PATH): Promise<void> {
  await writeJsonFile(filePath, sources);
}

export async function seedSourceRegistry(filePath = SOURCE_REGISTRY_PATH): Promise<SourceRecord[]> {
  const existing = await loadSourceRegistry(filePath);
  const merged = mergeSources(existing, SEED_SOURCES);
  await saveSourceRegistry(merged, filePath);
  return merged;
}
