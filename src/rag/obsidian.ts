import fs from "node:fs/promises";
import path from "node:path";
import { getConfig, knowledgebasePath } from "../config.js";
import { METHODOLOGY_NOTE } from "../methodology.js";
import type { SourceRecord } from "../types.js";
import { ensureDir, safeFilename, writeJsonFile } from "../utils/fs.js";

export interface KnowledgebaseInitResult {
  root: string;
  directories: string[];
  files: string[];
}

const KB_DIRS = ["methodology", "industries", "companies", "reports", "sources", "runs", "templates"];

function sourceNote(source: SourceRecord): string {
  return `# ${source.title}

- Source ID: \`${source.id}\`
- Tier: \`${source.tier}\`
- Type: \`${source.sourceType}\`
- Publisher: ${source.publisher}
- Observed: ${source.observedAt}
- URL/Path: ${source.url ?? source.path ?? "n/a"}
- Tags: ${source.evidenceTags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ")}

## Summary

${source.summary}
`;
}

export async function initializeKnowledgebase(sources: SourceRecord[], root = knowledgebasePath(getConfig())): Promise<KnowledgebaseInitResult> {
  const directories: string[] = [];
  const files: string[] = [];
  await ensureDir(root);
  for (const dir of KB_DIRS) {
    const fullPath = path.join(root, dir);
    await ensureDir(fullPath);
    directories.push(fullPath);
  }

  const indexPath = path.join(root, "00-README.md");
  await fs.writeFile(
    indexPath,
    `# Serenity A股产业投研

该知识库是 trading agent 的 RAG 根目录。所有结论必须能回溯到 \`sources/source-registry.json\` 中的 Source ID。

## Folder Map

- \`methodology/\`: Serenity 产业链瓶颈方法论和评分规则
- \`industries/\`: 行业链条、瓶颈、技术路线
- \`companies/\`: A 股候选公司研究卡片
- \`reports/\`: 卖方研报、本地高质量资料索引
- \`sources/\`: 来源注册表和来源卡片
- \`runs/\`: 每次筛选输出
- \`templates/\`: 候选、行业、证据模板

## Guardrails

- 社交媒体仅作为线索，不作为高置信度结论。
- 高置信度必须有 P0 主来源和独立交叉验证。
- Agent 输出候选和证据，不输出买卖指令。
`,
    "utf8",
  );
  files.push(indexPath);

  const methodologyPath = path.join(root, "methodology", "Serenity产业链瓶颈方法论.md");
  await fs.writeFile(methodologyPath, METHODOLOGY_NOTE, "utf8");
  files.push(methodologyPath);

  const templatePath = path.join(root, "templates", "Candidate.md");
  await fs.writeFile(
    templatePath,
    `# {{code}} {{name}}

## Thesis

## Evidence

| Source ID | Tier | Evidence | Effect |
| --- | --- | --- | --- |

## Risks

## Coverage Gaps
`,
    "utf8",
  );
  files.push(templatePath);

  const registryPath = path.join(root, "sources", "source-registry.json");
  await writeJsonFile(registryPath, sources);
  files.push(registryPath);

  for (const source of sources) {
    const notePath = path.join(root, "sources", `${safeFilename(source.id)}.md`);
    await fs.writeFile(notePath, sourceNote(source), "utf8");
    files.push(notePath);
  }

  return { root, directories, files };
}
