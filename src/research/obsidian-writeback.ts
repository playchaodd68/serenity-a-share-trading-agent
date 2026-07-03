import fs from "node:fs/promises";
import path from "node:path";
import { knowledgebasePath } from "../config.js";
import { ensureDir } from "../utils/fs.js";
import type { ScreenRun } from "../types.js";
import type { BearCaseRecord } from "./debate/bear-case.js";
import type { DebateVerdict } from "./debate/verdict.js";

// F-layer: research outputs flow BACK into the vault as dated notes, wikilinked to the
// auto company dossiers. The vault stops being a one-way report warehouse and becomes
// the research memory: thesis -> adversarial review -> outcome, all on linked pages.

async function dossierWikilink(name: string, kbPath: string): Promise<string> {
  const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
  try {
    await fs.access(path.join(kbPath, "companies", `${safeName}.md`));
    return `[[${safeName}]]`;
  } catch {
    return name;
  }
}

export function renderBearCaseNote(record: BearCaseRecord, verdict: DebateVerdict, companyLink: string, now: string): string {
  const report = record.report;
  const lines = [
    "---",
    "type: bear-case",
    `code: "${record.code}"`,
    `verdict: ${report?.verdict ?? record.status}`,
    `rating: ${verdict.rating}`,
    `generatedAt: ${record.generatedAt}`,
    "---",
    "",
    `# 反方审查：${record.code} ${companyLink}`,
    "",
    `- 裁决：**${verdict.rating}**（bear verdict: ${verdict.bearVerdict}）`,
    `- ${verdict.rationale}`,
    "",
  ];
  if (report) {
    lines.push("## Steel-man", report.steelMan, "", "## 失效五问");
    for (const finding of report.failureFindings) {
      lines.push(`- [${finding.severity}/${finding.confidence.toFixed(2)}] ${finding.questionId}: ${finding.finding}`);
    }
    lines.push("", "## Bear 论点");
    for (const argument of report.bearArguments) {
      lines.push(`- ${argument.claim}（证据：${argument.evidenceRefs.join(", ")}）`);
    }
  } else {
    lines.push(`> pass 未完成（${record.status}）：${record.errorDetail ?? ""}`);
  }
  lines.push("", `> 写入于 ${now}；本页为反方研究记录，不构成投资建议。`);
  return lines.join("\n");
}

export async function writeBearCaseNote(record: BearCaseRecord, verdict: DebateVerdict, kbPath = knowledgebasePath()): Promise<string> {
  const dir = path.join(kbPath, "research-log", "bear-cases");
  await ensureDir(dir);
  const now = new Date().toISOString();
  const filePath = path.join(dir, `${record.generatedAt.slice(0, 10)}-${record.code}.md`);
  const companyLink = await dossierWikilink(record.name, kbPath);
  await fs.writeFile(filePath, renderBearCaseNote(record, verdict, companyLink, now), "utf8");
  return filePath;
}

export function renderScreenRunNote(run: ScreenRun, candidateLinks: string[], now: string): string {
  const downgrades = (run.hotThemeDowngrades ?? []).filter((entry) => entry.downgraded);
  return [
    "---",
    "type: screen-run",
    `runId: ${run.runId}`,
    `generatedAt: ${run.generatedAt}`,
    `scanned: ${run.totalStocksScanned}`,
    "---",
    "",
    `# 筛选记录 ${run.generatedAt.slice(0, 10)}`,
    "",
    `- 扫描 ${run.totalStocksScanned} 只，候选 ${run.candidates.length} 只`,
    `- 热门降级：${downgrades.length > 0 ? downgrades.map((entry) => entry.label).join("、") : "本轮无强制降级"}`,
    "",
    "## 候选（证据排名）",
    ...run.candidates.slice(0, 15).map((candidate, index) => {
      const link = candidateLinks[index] ?? candidate.stock.name;
      return `${index + 1}. ${candidate.stock.code} ${link} — ${candidate.score.toFixed(1)} (${candidate.confidence})`;
    }),
    "",
    `> 写入于 ${now}；研究候选清单，不构成投资建议。`,
  ].join("\n");
}

export async function writeScreenRunNote(run: ScreenRun, kbPath = knowledgebasePath()): Promise<string> {
  const dir = path.join(kbPath, "research-log", "screens");
  await ensureDir(dir);
  const now = new Date().toISOString();
  const candidateLinks = await Promise.all(run.candidates.slice(0, 15).map((candidate) => dossierWikilink(candidate.stock.name, kbPath)));
  const filePath = path.join(dir, `${run.runId}.md`);
  await fs.writeFile(filePath, renderScreenRunNote(run, candidateLinks, now), "utf8");
  return filePath;
}
