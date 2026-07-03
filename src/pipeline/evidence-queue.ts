import path from "node:path";
import type { Candidate, GraveyardEntry } from "../types.js";
import { writeJsonFile } from "../utils/fs.js";

export const EVIDENCE_QUEUE_PATH = path.resolve("runs/evidence-queue.json");
export const EVIDENCE_QUEUE_MAX_ENTRIES = 50;

// 证据补齐队列：evidence-gap 墓地条目的处置出口（2026-07-03 持仓误判复盘）。这些标的
// 是"先验命中主题但材料不足"——没读过，不是读过并否决——所以不渲染为红色警告，而是
// 排队定向补材料。确定性规则，无打分：队列顺序就是方法论证据分降序。
export interface EvidenceQueueEntry {
  code: string;
  name: string;
  score: number;
  confidence: Candidate["confidence"];
  matchedThemes: string[];
  reasons: string[];
  nextActions: string[];
  queuedAt: string;
}

export interface EvidenceQueue {
  updatedAt: string;
  entries: EvidenceQueueEntry[];
}

// 具体补齐动作而非空泛提示：都是本仓库已有或已接入的确定性数据通道。
const EVIDENCE_BACKFILL_ACTIONS = [
  "拉取巨潮资讯 P0 公告(cninfo connector)",
  "检索 FFD 研报库定向补齐",
  "查互动易/投资者关系披露",
] as const;

export function buildEvidenceQueue(buriedEntries: GraveyardEntry[], now: string): EvidenceQueue {
  const entries = buriedEntries
    .filter((entry) => entry.reason === "evidence-gap")
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
    .slice(0, EVIDENCE_QUEUE_MAX_ENTRIES)
    .map((entry) => ({
      code: entry.code,
      name: entry.name,
      score: entry.score,
      confidence: entry.confidence,
      matchedThemes: [...entry.matchedThemes],
      reasons: [
        `先验命中主题(${entry.matchedThemes.join("、")})但证据覆盖不足(confidence=${entry.confidence})，按证据缺口排队补材料，不作否决。`,
        entry.detail,
      ],
      nextActions: [...EVIDENCE_BACKFILL_ACTIONS],
      queuedAt: entry.buriedAt || now,
    }));
  return { updatedAt: now, entries };
}

export async function writeEvidenceQueue(queue: EvidenceQueue, filePath = EVIDENCE_QUEUE_PATH): Promise<void> {
  await writeJsonFile(filePath, queue);
}

const EVIDENCE_QUEUE_RENDER_LIMIT = 10;

// CLI `evidence-queue` 与飞书 `/queue` 共用的中文报告。渲染层反复强调语义框定：
// 队列里的标的是"没读过"（材料不足），不是"读过并否决"，更不是买入建议。
export function renderEvidenceQueueReport(queue: EvidenceQueue | null): string {
  if (queue == null) {
    return "证据补齐队列尚未生成（runs/evidence-queue.json 不存在）。先运行 npm run screen（或飞书 /screen）产出一次筛选即可生成。";
  }
  const header = `证据补齐队列（更新于 ${queue.updatedAt.slice(0, 10)}）：共 ${queue.entries.length} 条`;
  const framing = "先验达标但材料不足——补齐证据后再判，不是买入建议。";
  if (queue.entries.length === 0) {
    return [header, "本轮筛选没有先验命中主题但证据覆盖不足的标的。"].join("\n");
  }
  const shown = queue.entries.slice(0, EVIDENCE_QUEUE_RENDER_LIMIT);
  const lines = shown.map((entry, index) =>
    [
      `${index + 1}. ${entry.code} ${entry.name} · 证据分 ${entry.score} · 置信度 ${entry.confidence} · 入队 ${entry.queuedAt.slice(0, 10)}`,
      `   主题：${entry.matchedThemes.join("、") || "-"}`,
      `   补齐动作：${entry.nextActions.join("；")}`,
    ].join("\n"),
  );
  const remainder = queue.entries.length - shown.length;
  const footer = remainder > 0 ? [`（另有 ${remainder} 条在队列中未显示，完整清单见 runs/evidence-queue.json。）`] : [];
  return [header, framing, ...lines, ...footer].join("\n");
}
