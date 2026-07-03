import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { appendJsonl, readJsonFile } from "../utils/fs.js";

// 面板「操作执行」任务执行器：把面板 GUI 的动作按钮映射为白名单内的管线命令，
// 替代终端交互。安全边界与并发约束：
// 1. 动作注册表是唯一入口——未知动作一律 400，绝不把请求内容拼进命令行；
// 2. spawn 一律 argv 数组 + shell:false + cwd=rootDir，用户可控参数只有 FFD 报告 id，
//    且必须通过白名单正则（manifest id 真实格式）才会进入 argv，杜绝注入；
// 3. 全局单并发：管线命令彼此共享 reports/、data/、runs/ 工件，串行是正确性要求
//    而非性能取舍；busy 时返回 409 与正在运行的 jobId；
// 4. 每步 20 分钟超时强杀；任务落定后向 runs/panel-jobs.jsonl 追加审计行。

export type JobStatus = "running" | "succeeded" | "failed";

/** API 契约中的 JobRecord（面板前端并行开发依赖此形态，字段不得偏离）。 */
export interface JobRecord {
  id: string;
  name: string;
  params: Record<string, unknown>;
  status: JobStatus;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  logTail: string[];
}

export type JobSpawnImpl = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface JobRunnerOptions {
  /** 项目根目录：spawn 的 cwd，也是 node_modules/.bin/tsx 与审计文件的定位基准。 */
  rootDir: string;
  /** spawn 注入（测试用假命令验证生命周期）；默认 node:child_process.spawn。 */
  spawnImpl?: JobSpawnImpl;
  /** 可注入时钟；影响 jobId、startedAt/endedAt 与 backtest 日期区间。 */
  now?: () => Date;
  /** 单步超时毫秒数（测试注入用）；默认 20 分钟。 */
  stepTimeoutMs?: number;
}

export type StartJobOutcome =
  | { ok: true; jobId: string }
  | { ok: false; status: 400 | 409; error: string; runningJobId?: string };

export interface JobRunner {
  start(name: string, params: Record<string, unknown>): Promise<StartJobOutcome>;
  get(id: string): JobRecord | undefined;
  list(limit?: number): JobRecord[];
  /** 等待任务落定（含审计行写盘），测试用；未知 id 时 reject。 */
  waitFor(id: string): Promise<JobRecord>;
}

const MAX_LOG_TAIL_LINES = 400;
const DEFAULT_STEP_TIMEOUT_MS = 20 * 60_000;
const DEFAULT_LIST_LIMIT = 20;
const MAX_JOB_HISTORY = 200;
const BACKTEST_LOOKBACK_DAYS = 180;

// manifest id 的真实格式（src/research/report-library.ts）：
// `FFD-REPORT-${sha256(file).slice(0, 12).toUpperCase()}` → 固定 12 位大写十六进制。
const FFD_REPORT_ID_PATTERN = /^FFD-REPORT-[0-9A-F]{12}$/;

interface JobStep {
  argv: string[];
}

interface ActionContext {
  rootDir: string;
  now: () => Date;
}

interface ActionDefinition {
  /** 参数校验：返回错误文案表示 400；不做任何 IO。 */
  validate?(params: Record<string, unknown>): string | null;
  buildSteps(params: Record<string, unknown>, context: ActionContext): Promise<JobStep[]> | JobStep[];
}

// launchd 服务环境的 PATH 不含 node，node_modules/.bin/tsx 的 #!/usr/bin/env node
// shim 会以 exit 127 失败——绕过 shim，用当前进程的 node 二进制直接加载 tsx CLI 入口。
function tsxCliEntry(rootDir: string): string {
  return path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
}

function cliStep(rootDir: string, ...cliArgs: string[]): JobStep {
  return { argv: [process.execPath, tsxCliEntry(rootDir), "src/cli.ts", ...cliArgs] };
}

function compactDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function validateReportId(params: Record<string, unknown>): string | null {
  if (typeof params.id !== "string" || !FFD_REPORT_ID_PATTERN.test(params.id)) {
    return "参数 id 非法：应形如 FFD-REPORT-XXXXXXXXXXXX（12 位大写十六进制）。";
  }
  return null;
}

// 从最新 screen run 推导 fetch-quant-history 的 codes 位置参数：
// 6 开头 → SH:，0/3 开头 → SZ:；北交所等其它前缀没有东财沪深 secid 映射，直接过滤。
// 任何读取失败都返回 null（调用方完全落回脚本内置默认），推导绝不让任务启动失败。
async function deriveBacktestCodes(reportsDir: string): Promise<string | null> {
  interface LooseScreenRun {
    generatedAt?: string;
    candidates?: Array<{ stock?: { code?: unknown } }>;
  }
  let names: string[];
  try {
    names = await fs.readdir(reportsDir);
  } catch {
    return null;
  }
  let latest: LooseScreenRun | null = null;
  for (const name of names) {
    if (!name.startsWith("screen-") || !name.endsWith(".json")) continue;
    const run = await readJsonFile<LooseScreenRun | null>(path.join(reportsDir, name), null);
    if (!run?.generatedAt || !Array.isArray(run.candidates)) continue;
    if (!latest || run.generatedAt > (latest.generatedAt ?? "")) latest = run;
  }
  if (!latest) return null;
  const codes: string[] = [];
  for (const candidate of latest.candidates ?? []) {
    const code = candidate?.stock?.code;
    if (typeof code !== "string" || !/^\d{6}$/.test(code)) continue;
    const market = code.startsWith("6") ? "SH" : code.startsWith("0") || code.startsWith("3") ? "SZ" : null;
    if (!market) continue;
    const entry = `${market}:${code}`;
    if (!codes.includes(entry)) codes.push(entry);
  }
  return codes.length > 0 ? codes.join(",") : null;
}

// 动作注册表（白名单）。argv 形态已对照 src/cli.ts 的真实解析方式：
// - reports-accept：process.argv.slice(3).join(" ") 再按空白切分，--force 可在任意位置，
//   id 取第一个非 --force 参数 → 这里固定 [--force?, id] 顺序；
// - reports-reject：只读 process.argv[3] → id 必须紧跟子命令。
const ACTIONS: Record<string, ActionDefinition> = {
  screen: { buildSteps: (_params, context) => [cliStep(context.rootDir, "screen")] },
  backtest: {
    async buildSteps(_params, context) {
      const codes = await deriveBacktestCodes(path.join(context.rootDir, "reports"));
      const end = context.now();
      const beg = new Date(end.getTime() - BACKTEST_LOOKBACK_DAYS * 86_400_000);
      const fetchArgv = [process.execPath, "scripts/fetch-quant-history.mjs"];
      // 脚本参数是位置式 [codes, beg, end]：codes 推导不出来时不传任何参数，完全落回脚本默认。
      if (codes) fetchArgv.push(codes, compactDate(beg), compactDate(end));
      return [
        { argv: fetchArgv },
        cliStep(context.rootDir, "quant-adapt-history", "--prices", "data/quant/history.csv", "--benchmark", "data/quant/benchmark.csv", "--run"),
      ];
    },
  },
  "resolutions-update": { buildSteps: (_params, context) => [cliStep(context.rootDir, "resolutions-update")] },
  "consensus-archive": { buildSteps: (_params, context) => [cliStep(context.rootDir, "consensus-archive")] },
  "reports-convert": { buildSteps: (_params, context) => [cliStep(context.rootDir, "reports-convert")] },
  "reports-accept-quality": { buildSteps: (_params, context) => [cliStep(context.rootDir, "reports-accept-quality")] },
  "reports-accept": {
    validate(params) {
      const idError = validateReportId(params);
      if (idError) return idError;
      if (params.force !== undefined && typeof params.force !== "boolean") return "参数 force 非法：应为布尔值。";
      return null;
    },
    buildSteps(params, context) {
      const flags = params.force === true ? ["--force"] : [];
      return [cliStep(context.rootDir, "reports-accept", ...flags, params.id as string)];
    },
  },
  "reports-reject": {
    validate: validateReportId,
    buildSteps: (params, context) => [cliStep(context.rootDir, "reports-reject", params.id as string)],
  },
};

// stdout/stderr 合流按行切分；跨 chunk 的半行先缓冲，流结束时 flush 残尾。
function createLineSink(push: (line: string) => void): { write(chunk: Buffer | string): void; flush(): void } {
  let buffer = "";
  return {
    write(chunk) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) push(line);
    },
    flush() {
      if (buffer !== "") {
        push(buffer);
        buffer = "";
      }
    },
  };
}

export function createJobRunner(options: JobRunnerOptions): JobRunner {
  const rootDir = path.resolve(options.rootDir);
  const spawnImpl = options.spawnImpl ?? nodeSpawn;
  const now = options.now ?? (() => new Date());
  const stepTimeoutMs = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const auditPath = path.join(rootDir, "runs", "panel-jobs.jsonl");

  // 内存任务表（Map 保持插入序）；settled 存每个任务的落定 promise（waitFor 用）。
  const records = new Map<string, JobRecord>();
  const settled = new Map<string, Promise<void>>();
  let runningJobId: string | null = null;

  function snapshot(record: JobRecord): JobRecord {
    return { ...record, params: { ...record.params }, logTail: [...record.logTail] };
  }

  function pushLine(record: JobRecord, line: string): void {
    record.logTail.push(line);
    if (record.logTail.length > MAX_LOG_TAIL_LINES) record.logTail.shift();
  }

  function newJobId(): string {
    // 与 runId 风格一致（screen-2026-07-03T11-07-23-485Z）：ISO 时间戳 + 随机后缀防同刻冲突。
    const stamp = now().toISOString().replace(/[:.]/g, "-");
    return `job-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
  }

  function pruneHistory(): void {
    if (records.size <= MAX_JOB_HISTORY) return;
    for (const [id, record] of records) {
      if (records.size <= MAX_JOB_HISTORY) break;
      if (record.status === "running") continue;
      records.delete(id);
      settled.delete(id);
    }
  }

  function runStep(record: JobRecord, step: JobStep, index: number, total: number): Promise<{ ok: boolean; exitCode?: number }> {
    pushLine(record, `[job] step ${index + 1}/${total}: ${step.argv.join(" ")}`);
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawnImpl(step.argv[0]!, step.argv.slice(1), {
          cwd: rootDir,
          env: process.env,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        pushLine(record, `[job] 启动失败：${error instanceof Error ? error.message : String(error)}`);
        resolve({ ok: false });
        return;
      }
      const sink = createLineSink((line) => pushLine(record, line));
      child.stdout?.on("data", (chunk: Buffer) => sink.write(chunk));
      child.stderr?.on("data", (chunk: Buffer) => sink.write(chunk));

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        pushLine(record, `[job] step ${index + 1} 超时（上限 ${Math.max(1, Math.round(stepTimeoutMs / 60_000))} 分钟），已强制终止。`);
        child.kill("SIGKILL");
      }, stepTimeoutMs);
      timer.unref?.();

      let settledStep = false;
      const settle = (outcome: { ok: boolean; exitCode?: number }): void => {
        if (settledStep) return;
        settledStep = true;
        clearTimeout(timer);
        sink.flush();
        resolve(outcome);
      };
      child.once("error", (error) => {
        pushLine(record, `[job] 进程错误：${error.message}`);
        settle({ ok: false });
      });
      // 用 close（而非 exit）：close 在 stdout/stderr 全部读尽后才触发，日志不缺尾。
      child.once("close", (code) => {
        if (timedOut) {
          settle({ ok: false });
          return;
        }
        settle({ ok: code === 0, exitCode: code ?? undefined });
      });
    });
  }

  async function executeJob(record: JobRecord, steps: JobStep[]): Promise<void> {
    let ok = true;
    let exitCode: number | undefined;
    for (const [index, step] of steps.entries()) {
      const result = await runStep(record, step, index, steps.length);
      exitCode = result.exitCode;
      if (!result.ok) {
        ok = false;
        pushLine(record, `[job] step ${index + 1} 失败${result.exitCode != null ? `（exit ${result.exitCode}）` : ""}，任务终止。`);
        break;
      }
    }
    record.status = ok ? "succeeded" : "failed";
    record.endedAt = now().toISOString();
    if (exitCode !== undefined) record.exitCode = exitCode;
    if (runningJobId === record.id) runningJobId = null;
    try {
      await appendJsonl(auditPath, {
        type: "panel-job",
        at: record.endedAt,
        id: record.id,
        name: record.name,
        params: record.params,
        status: record.status,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        exitCode: record.exitCode ?? null,
      });
    } catch (error) {
      // 审计失败不吞进日志黑洞：写进 logTail 让面板可见，但不影响任务终态。
      pushLine(record, `[job] 审计写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function start(name: string, params: Record<string, unknown>): Promise<StartJobOutcome> {
    const definition = ACTIONS[name];
    if (!definition) {
      return { ok: false, status: 400, error: `未知动作：${name}。可用动作：${Object.keys(ACTIONS).join(", ")}。` };
    }
    const validationError = definition.validate?.(params) ?? null;
    if (validationError) return { ok: false, status: 400, error: validationError };
    if (runningJobId) return { ok: false, status: 409, error: "已有任务运行中", runningJobId };

    const id = newJobId();
    // 先占坑再做 buildSteps 的磁盘 IO，避免两个并发 POST 同时通过单并发检查。
    runningJobId = id;
    let steps: JobStep[];
    try {
      steps = await definition.buildSteps(params, { rootDir, now });
    } catch (error) {
      runningJobId = null;
      throw error;
    }

    const record: JobRecord = {
      id,
      name,
      params: { ...params },
      status: "running",
      startedAt: now().toISOString(),
      logTail: [],
    };
    records.set(id, record);
    pruneHistory();
    const done = executeJob(record, steps).catch((error) => {
      // executeJob 已各处兜底；这里是最后一道防线，绝不让未处理 rejection 打崩面板进程。
      record.status = "failed";
      record.endedAt = record.endedAt ?? now().toISOString();
      pushLine(record, `[job] 执行器内部错误：${error instanceof Error ? error.message : String(error)}`);
      if (runningJobId === record.id) runningJobId = null;
    });
    settled.set(id, done);
    return { ok: true, jobId: id };
  }

  function get(id: string): JobRecord | undefined {
    const record = records.get(id);
    return record ? snapshot(record) : undefined;
  }

  function list(limit = DEFAULT_LIST_LIMIT): JobRecord[] {
    // 先反转（Map 插入序 → 新在前）再稳定排序，保证同一 startedAt 时后创建的任务排前面。
    return [...records.values()]
      .reverse()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, Math.max(1, limit))
      .map(snapshot);
  }

  async function waitFor(id: string): Promise<JobRecord> {
    const done = settled.get(id);
    if (!done) throw new Error(`未知任务：${id}`);
    await done;
    const record = records.get(id);
    if (!record) throw new Error(`任务已被清理：${id}`);
    return snapshot(record);
  }

  return { start, get, list, waitFor };
}
