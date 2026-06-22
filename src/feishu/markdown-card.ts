import { splitFeishuText } from "./text-utils.js";

// Feishu interactive-card model, verified against open.feishu.cn card JSON 1.0:
// - content sent to the IM API must be JSON.stringify(card) with header/elements at the top level.
// - The {tag:"markdown"} element renders bold/italic/strike/links/lists/dividers/code/<font>/<text_tag>,
//   but NOT ATX headings (#) or GFM pipe tables — those are converted here.
// - Inline <font color> supports only red/green/grey; the 13-color palette is available via <text_tag>.

export interface FeishuCardHeader {
  template: string;
  title: { tag: "plain_text"; content: string };
}

export interface FeishuMarkdownElement {
  tag: "markdown";
  content: string;
}

export interface FeishuCard {
  header: FeishuCardHeader;
  elements: FeishuMarkdownElement[];
}

const HEADER_TEMPLATES = new Set([
  "blue",
  "wathet",
  "turquoise",
  "green",
  "yellow",
  "orange",
  "red",
  "carmine",
  "violet",
  "purple",
  "indigo",
  "grey",
  "default",
]);

const DEFAULT_TEMPLATE = "blue";
const DEFAULT_TITLE = "Serenity 研究助手";
const CARD_CHUNK_LIMIT = 3200;
const MAX_TITLE_LENGTH = 100;
// Feishu rejects card/rich-text request bodies over 30 KB; stay under it with margin for the envelope.
const MAX_CARD_BODY_BYTES = 28_000;

const TIER_TEMPLATE: Record<string, string> = { P0: "red", P1: "orange", P2: "blue" };

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>]+/g, "")
    .trim();
}

function headingToBold(line: string): string {
  const match = /^(#{1,6})\s+(.*)$/.exec(line);
  if (!match) return line;
  const level = match[1].length;
  const text = match[2].trim();
  const marker = level <= 1 ? "🔷" : level === 2 ? "🔹" : "▪️";
  return `${marker} **${text}**`;
}

function isTableRow(line: string): boolean {
  return /\|/.test(line) && line.trim().startsWith("|");
}

function isTableSeparator(line: string): boolean {
  // Require a pipe so bare horizontal rules (`---`) are not mistaken for a table delimiter row.
  return line.includes("|") && line.includes("-") && /^\s*\|?[\s:|-]*-{1,}[\s:|-]*\|?\s*$/.test(line);
}

function parseRowCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Render a GFM pipe table as an aligned monospace code block (code blocks DO render in Feishu cards). */
function tableToCodeBlock(rows: string[][]): string {
  const columns = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, col) =>
    Math.max(...rows.map((row) => displayWidth(row[col] ?? ""))),
  );
  const lines = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columns }, (_, col) => padTo(row[col] ?? "", widths[col]));
    const text = cells.join("  ");
    if (rowIndex === 0) return text;
    return text;
  });
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  lines.splice(1, 0, separator);
  return ["```", ...lines, "```"].join("\n");
}

// CJK glyphs render ~2 monospace cells wide; approximate so columns align in the code block.
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) width += /[⺀-￿]/.test(char) ? 2 : 1;
  return width;
}

function padTo(text: string, width: number): string {
  const pad = width - displayWidth(text);
  return pad > 0 ? text + " ".repeat(pad) : text;
}

/**
 * Rewrite agent GFM into the subset Feishu cards actually render:
 * ATX headings -> bold lines, pipe tables -> aligned code blocks, lists/dividers preserved.
 * The first top-level (#) heading is lifted out and returned as the card title.
 */
export function normalizeMarkdownStructure(markdown: string): { title?: string; body: string } {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let title: string | undefined;
  let index = 0;

  // Lift a leading H1 into the card title.
  while (index < lines.length && lines[index].trim() === "") index += 1;
  const firstHeading = index < lines.length ? /^#\s+(.*)$/.exec(lines[index]) : null;
  if (firstHeading) {
    title = stripInlineMarkdown(firstHeading[1]).slice(0, MAX_TITLE_LENGTH);
    index += 1;
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index];

    if (isTableRow(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const rows: string[][] = [parseRowCells(line)];
      let cursor = index + 2;
      while (cursor < lines.length && isTableRow(lines[cursor])) {
        rows.push(parseRowCells(lines[cursor]));
        cursor += 1;
      }
      out.push(tableToCodeBlock(rows));
      index = cursor - 1;
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      out.push(headingToBold(line));
      continue;
    }

    out.push(line);
  }

  return { title, body: out.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

function applyTokenColors(text: string): string {
  return text
    .replace(/(^|[^\w])PASS\b/g, (_match, lead) => `${lead}<font color='green'>PASS</font>`)
    .replace(/(^|[^\w])FAIL\b/g, (_match, lead) => `${lead}<font color='red'>FAIL</font>`)
    .replace(/\bP0\b/g, `<text_tag color='${TIER_TEMPLATE.P0}'>P0</text_tag>`)
    .replace(/\bP1\b/g, `<text_tag color='${TIER_TEMPLATE.P1}'>P1</text_tag>`)
    .replace(/\bP2\b/g, `<text_tag color='${TIER_TEMPLATE.P2}'>P2</text_tag>`)
    .replace(/✓|✔/g, "<font color='green'>✓</font>")
    .replace(/✗|✘/g, "<font color='red'>✗</font>");
}

/** Colorize status/tier tokens, skipping fenced and inline code so we never recolor literal code. */
export function colorizeFeishuTokens(markdown: string): string {
  const segments = markdown.split(/(```[\s\S]*?```|`[^`]*`)/g);
  return segments.map((segment) => (segment.startsWith("`") ? segment : applyTokenColors(segment))).join("");
}

function resolveTemplate(template?: string): string {
  return template && HEADER_TEMPLATES.has(template) ? template : DEFAULT_TEMPLATE;
}

function cardTitle(baseTitle: string, suffix: string): string {
  const clean = stripInlineMarkdown(baseTitle) || DEFAULT_TITLE;
  return `${clean.slice(0, MAX_TITLE_LENGTH - suffix.length)}${suffix}`;
}

function buildCard(title: string, content: string, template: string): FeishuCard {
  return {
    header: { template, title: { tag: "plain_text", content: title } },
    elements: [{ tag: "markdown", content }],
  };
}

export interface BuildCardOptions {
  title?: string;
  template?: string;
}

export interface FeishuReplyPlan {
  // cards[i] is null when the colorized card would exceed the byte budget; send textChunks[i] instead.
  cards: Array<FeishuCard | null>;
  textChunks: string[];
}

/**
 * Plan a Feishu reply: one card per ~3200-char chunk plus the matching plain-text chunk for each,
 * so a caller can send cards and fall back to text per-chunk without dropping or duplicating content.
 * A card that would exceed the 30 KB body limit (after colorization) is returned as null.
 */
export function buildFeishuReply(markdown: string, options: BuildCardOptions = {}): FeishuReplyPlan {
  const text = markdown.trim();
  if (!text) return { cards: [], textChunks: [] };
  const { title: liftedTitle, body } = normalizeMarkdownStructure(text);
  const baseTitle = liftedTitle ?? options.title ?? DEFAULT_TITLE;
  const template = resolveTemplate(options.template);
  const chunks = splitFeishuText(body || text, CARD_CHUNK_LIMIT);

  const cards: Array<FeishuCard | null> = [];
  for (const [index, chunk] of chunks.entries()) {
    const suffix = chunks.length > 1 ? ` [${index + 1}/${chunks.length}]` : "";
    const card = buildCard(cardTitle(baseTitle, suffix), colorizeFeishuTokens(chunk), template);
    cards.push(Buffer.byteLength(JSON.stringify(card), "utf8") <= MAX_CARD_BODY_BYTES ? card : null);
  }
  return { cards, textChunks: chunks };
}

/**
 * Convert agent Markdown into Feishu interactive cards (one per ~3200-char chunk), dropping any chunk
 * whose card would exceed the size limit. Returns [] when there is nothing to send.
 */
export function buildFeishuCards(markdown: string, options: BuildCardOptions = {}): FeishuCard[] {
  return buildFeishuReply(markdown, options).cards.filter((card): card is FeishuCard => card != null);
}
