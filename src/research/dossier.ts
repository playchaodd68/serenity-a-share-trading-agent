import path from "node:path";
import fs from "node:fs/promises";
import { knowledgebasePath } from "../config.js";
import { ensureDir } from "../utils/fs.js";
import { buildClaimsEntityIndex, type ClaimsEntityIndex, type CompanyClaimRef } from "./claims-index.js";
import { obsidianUriForPath } from "./obsidian-link.js";

// Auto-generated company dossiers: one note per company aggregating every claim the
// accepted library makes about it, wikilinked to the source report notes. This turns
// the empty companies/ folder into the entity backbone of the vault graph. Dossiers
// are P1-derived context — the header repeats the P0-verification discipline so a
// dossier can never masquerade as primary evidence.

const MIN_CLAIMS_FOR_DOSSIER = 2;
const MAX_CLAIMS_PER_DOSSIER = 40;

export interface DossierRun {
  companiesDir: string;
  written: string[];
  skipped: number;
  companyCount: number;
}

function polarityBadge(polarity: string): string {
  return polarity === "positive" ? "🟢" : polarity === "negative" ? "🔴" : "⚪";
}

function noteLink(ref: CompanyClaimRef): string {
  if (!ref.notePath) return ref.title;
  const base = path.basename(ref.notePath).replace(/\.md$/i, "");
  return `[[${base}]]`;
}

export function renderDossier(company: string, refs: CompanyClaimRef[], now: string): string {
  const reports = new Map<string, CompanyClaimRef[]>();
  for (const ref of refs.slice(0, MAX_CLAIMS_PER_DOSSIER)) {
    reports.set(ref.reportId, [...(reports.get(ref.reportId) ?? []), ref]);
  }
  const lines = [
    "---",
    "type: company-dossier",
    `company: ${company}`,
    `updatedAt: ${now}`,
    `reports: ${reports.size}`,
    `claims: ${Math.min(refs.length, MAX_CLAIMS_PER_DOSSIER)}`,
    "---",
    "",
    `# ${company}`,
    "",
    "> 自动聚合的 P1 卖方研报论断，未经候选级 P0 验证；本页是研究线索索引，不构成证据结论。",
    "",
  ];
  for (const [, group] of reports) {
    const head = group[0];
    lines.push(`## ${head.publishedAt ?? "日期未知"} ${head.institution ?? "机构未知"} — ${noteLink(head)}`);
    for (const ref of group) {
      const strength = ref.claim.evidenceStrength ? `/${ref.claim.evidenceStrength}` : "";
      lines.push(`- ${polarityBadge(ref.claim.polarity)}${strength} ${ref.claim.text.replace(/\s+/g, " ").slice(0, 200)}`);
    }
    lines.push("");
  }
  const topics = [...new Set(refs.flatMap((ref) => ref.claim.topics ?? []))].slice(0, 8);
  if (topics.length > 0) {
    lines.push("## 相关主题", ...topics.map((topic) => `- ${topic}`), "");
  }
  return lines.join("\n");
}

export async function generateCompanyDossiers(index?: ClaimsEntityIndex): Promise<DossierRun> {
  const claimsIndex = index ?? (await buildClaimsEntityIndex());
  const companiesDir = path.join(knowledgebasePath(), "companies");
  await ensureDir(companiesDir);
  const now = new Date().toISOString();
  const written: string[] = [];
  let skipped = 0;
  for (const [company, refs] of claimsIndex.companies) {
    if (refs.length < MIN_CLAIMS_FOR_DOSSIER) {
      skipped += 1;
      continue;
    }
    const safeName = company.replace(/[\\/:*?"<>|]/g, "_");
    const filePath = path.join(companiesDir, `${safeName}.md`);
    await fs.writeFile(filePath, renderDossier(company, refs, now), "utf8");
    written.push(filePath);
  }
  return { companiesDir, written, skipped, companyCount: claimsIndex.companies.size };
}

export function renderDossierRun(run: DossierRun): string {
  const sample = run.written.slice(0, 5).map((file) => `- ${path.basename(file)}`);
  return [
    `Company dossiers: wrote ${run.written.length} (skipped ${run.skipped} below-threshold) of ${run.companyCount} companies -> ${run.companiesDir}`,
    ...sample,
    ...(run.written.length > 5 ? [`- ... ${run.written.length - 5} more`] : []),
  ].join("\n");
}

export function renderCompanyClaims(company: string, refs: CompanyClaimRef[]): string {
  if (refs.length === 0) return `本地研报库中没有关于「${company}」的论断（claims）。`;
  const lines = [
    `「${company}」的研报论断（${refs.length} 条，P1 未经 P0 验证）：`,
  ];
  for (const ref of refs.slice(0, 10)) {
    lines.push(
      `- ${polarityBadge(ref.claim.polarity)} ${ref.claim.text.replace(/\s+/g, " ").slice(0, 140)}`,
      `  来源：[${ref.sourceRecordId}] ${ref.institution ?? ""} ${ref.publishedAt ?? ""}${ref.notePath ? ` 打开：${obsidianUriForPath(ref.notePath) ?? ref.notePath}` : ""}`,
    );
  }
  return lines.join("\n");
}
