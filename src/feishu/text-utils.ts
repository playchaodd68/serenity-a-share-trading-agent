// Pure text-chunking utilities for Feishu messages. Kept separate from feishu.ts (HTTP layer) and
// markdown-card.ts (card rendering) so both can depend on them without a circular import.

export const FEISHU_TEXT_LIMIT = 3500;
const FEISHU_CHUNK_PREFIX_RESERVE = 40;

export function splitFeishuText(text: string, limit = FEISHU_TEXT_LIMIT): string[] {
  if (!Number.isFinite(limit) || limit < 1) throw new Error("Feishu text chunk limit must be positive.");
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    if (text.length - start <= limit) {
      chunks.push(text.slice(start));
      break;
    }

    const windowEnd = start + limit;
    const minSoftCut = start + Math.floor(limit * 0.5);
    let cut = text.lastIndexOf("\n\n", windowEnd);
    if (cut <= minSoftCut) cut = text.lastIndexOf("\n", windowEnd);
    if (cut <= minSoftCut) {
      cut = windowEnd;
    } else if (text.startsWith("\n\n", cut) && cut + 2 <= windowEnd) {
      cut += 2;
    } else if (text.startsWith("\n", cut) && cut + 1 <= windowEnd) {
      cut += 1;
    }

    chunks.push(text.slice(start, cut));
    start = cut;
  }
  return chunks;
}

export function formatFeishuTextChunks(text: string, limit = FEISHU_TEXT_LIMIT): string[] {
  const chunkLimit = Math.max(1, limit - FEISHU_CHUNK_PREFIX_RESERVE);
  const chunks = splitFeishuText(text, chunkLimit);
  if (chunks.length <= 1) return chunks;
  return chunks.map((chunk, index) => `[${index + 1}/${chunks.length}]\n${chunk}`);
}
