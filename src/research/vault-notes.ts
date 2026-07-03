import fs from "node:fs/promises";
import path from "node:path";
import { knowledgebasePath } from "../config.js";
import type { LibraryDocument } from "./library-search.js";

// A-layer of the RAG upgrade: index the vault's own notes alongside broker reports.
// Tier isolation is the anti-sycophancy contract here: the user's hand-written notes
// are retrievable CONTEXT ("user-thesis"), never external evidence — retrieval labels
// them loudly so the user's own opinions can never launder back as corroboration.
// Excluded on purpose: reports/FFD (already indexed via chunks.json) and companies/
// (auto-generated from the same claims — indexing them would double-count content).

export type VaultNoteTier = "user-thesis" | "system-note";

const VAULT_SOURCES: Array<{ dir: string; tier: VaultNoteTier }> = [
  { dir: "methodology", tier: "system-note" },
  { dir: "signals", tier: "system-note" },
  { dir: "research-log", tier: "system-note" },
  { dir: "industries", tier: "user-thesis" },
  { dir: "notes", tier: "user-thesis" },
];

const NOTE_CHUNK_MAX_TOKENS = 800;
const NOTE_MIN_TOKENS = 12;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^\s*---\n[\s\S]*?\n---\s*\n/, "");
}

function noteTitle(markdown: string, fileName: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fileName.replace(/\.md$/i, "");
}

export function chunkNote(markdown: string): string[] {
  const body = stripFrontmatter(markdown);
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (estimateTokens(candidate) > NOTE_CHUNK_MAX_TOKENS && current) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((chunk) => estimateTokens(chunk) >= NOTE_MIN_TOKENS);
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectMarkdownFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files.sort();
}

export async function loadVaultNoteDocuments(kbPath = knowledgebasePath()): Promise<LibraryDocument[]> {
  const documents: LibraryDocument[] = [];
  for (const source of VAULT_SOURCES) {
    const dir = path.join(kbPath, source.dir);
    for (const filePath of await collectMarkdownFiles(dir)) {
      let markdown: string;
      let mtime: Date;
      try {
        markdown = await fs.readFile(filePath, "utf8");
        mtime = (await fs.stat(filePath)).mtime;
      } catch {
        continue;
      }
      const relative = path.relative(kbPath, filePath);
      const title = noteTitle(markdown, path.basename(filePath));
      chunkNote(markdown).forEach((text, index) => {
        documents.push({
          reportId: `VAULT-${relative}`,
          sourceRecordId: `VAULT-${relative}`,
          chunkId: `note-chunk-${index + 1}`,
          title,
          institution: source.tier === "user-thesis" ? "本地笔记" : "系统笔记",
          publishedAt: mtime.toISOString().slice(0, 10),
          status: "vault",
          text,
          sectionTitle: undefined,
          topics: [],
          companies: [],
          sourceTier: source.tier,
          requiresP0Verification: true,
          tokenEstimate: estimateTokens(text),
          notePath: filePath,
        });
      });
    }
  }
  return documents;
}
