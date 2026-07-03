import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn, type SpawnOptions } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJobRunner, type JobRunner, type JobSpawnImpl } from "../src/panel/jobs.js";

const FIXED_NOW = new Date("2026-07-04T05:00:00.000Z");
const VALID_REPORT_ID = "FFD-REPORT-00550D0251C5";

// 测试全程用假命令（node -e）验证生命周期，绝不真跑 screen/backtest 管线；
// spawnImpl 注入层负责记录 runner 实际构造的 argv，再替换为无害进程。
const LIFECYCLE_SCRIPT = 'console.log("out-line"); console.error("err-line"); setTimeout(() => {}, 250);';
const FAST_SCRIPT = 'console.log("done");';
const SLOW_SCRIPT = "setTimeout(() => {}, 400);";
const FAIL_SCRIPT = "process.exit(3);";
const HANG_SCRIPT = "setTimeout(() => {}, 5000);";
const MANY_LINES_SCRIPT = 'for (let i = 0; i < 450; i += 1) console.log("line-" + i);';

interface SpawnCall {
  command: string;
  args: string[];
  options: SpawnOptions;
}

function captureSpawn(script: string): { calls: SpawnCall[]; impl: JobSpawnImpl } {
  const calls: SpawnCall[] = [];
  const impl: JobSpawnImpl = (command, args, options) => {
    calls.push({ command, args: [...args], options });
    return spawn(process.execPath, ["-e", script], options);
  };
  return { calls, impl };
}

// 与实现同构的本地日期压缩（YYYYMMDD），保证断言不依赖测试机时区。
function compactLocalDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function expectStarted(outcome: Awaited<ReturnType<JobRunner["start"]>>): string {
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) throw new Error("job did not start");
  return outcome.jobId;
}

describe("panel job runner", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "panel-jobs-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  // 生产实现绕过 node_modules/.bin/tsx shim（launchd 环境 PATH 无 node，shim 会 exit 127），
  // 用当前 node 二进制直接加载 tsx CLI 入口——断言与之对齐。
  function tsxEntry(): string {
    return path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
  }

  describe("action registry whitelist", () => {
    it("rejects an unknown action with 400 and never spawns", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const outcome = await runner.start("rm -rf /", {});
      expect(outcome).toMatchObject({ ok: false, status: 400 });
      expect(calls).toHaveLength(0);
    });

    it("builds the tsx argv for every simple whitelisted action", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const simpleActions = ["screen", "resolutions-update", "consensus-archive", "reports-convert", "reports-accept-quality"];
      for (const name of simpleActions) {
        const jobId = expectStarted(await runner.start(name, {}));
        const record = await runner.waitFor(jobId);
        expect(record.status).toBe("succeeded");
      }
      expect(calls).toHaveLength(simpleActions.length);
      for (const [index, name] of simpleActions.entries()) {
        expect(calls[index]!.command).toBe(process.execPath);
        expect(calls[index]!.args).toEqual([tsxEntry(), "src/cli.ts", name]);
        expect(calls[index]!.options.cwd).toBe(rootDir);
        expect(calls[index]!.options.shell).toBe(false);
      }
    });
  });

  describe("reports-accept / reports-reject id 校验（防 argv 注入）", () => {
    const invalidIds: unknown[] = [
      undefined,
      "",
      123,
      "ffd-report-00550d0251c5", // 小写：manifest id 固定为大写十六进制
      "FFD-REPORT-00550D0251C", // 11 位
      "FFD-REPORT-00550D0251C5X", // 13 位
      "../../etc/passwd",
      "FFD-REPORT-00550D0251C5; rm -rf /",
      "--force",
    ];

    it("rejects invalid reports-accept ids with 400 and never spawns", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      for (const id of invalidIds) {
        const outcome = await runner.start("reports-accept", { id });
        expect(outcome).toMatchObject({ ok: false, status: 400 });
      }
      expect(calls).toHaveLength(0);
    });

    it("rejects invalid reports-reject ids with 400", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      for (const id of invalidIds) {
        const outcome = await runner.start("reports-reject", { id });
        expect(outcome).toMatchObject({ ok: false, status: 400 });
      }
      expect(calls).toHaveLength(0);
    });

    it("rejects a non-boolean force with 400", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const outcome = await runner.start("reports-accept", { id: VALID_REPORT_ID, force: "yes" });
      expect(outcome).toMatchObject({ ok: false, status: 400 });
      expect(calls).toHaveLength(0);
    });

    it("builds reports-accept argv without force (id 紧跟子命令)", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("reports-accept", { id: VALID_REPORT_ID }));
      await runner.waitFor(jobId);
      expect(calls[0]!.command).toBe(process.execPath);
      expect(calls[0]!.args).toEqual([tsxEntry(), "src/cli.ts", "reports-accept", VALID_REPORT_ID]);
    });

    it("builds reports-accept argv with --force before the id", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("reports-accept", { id: VALID_REPORT_ID, force: true }));
      const record = await runner.waitFor(jobId);
      expect(record.params).toEqual({ id: VALID_REPORT_ID, force: true });
      expect(calls[0]!.args).toEqual([tsxEntry(), "src/cli.ts", "reports-accept", "--force", VALID_REPORT_ID]);
    });

    it("builds reports-reject argv with the id at argv[3] (cli 只读该位置)", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("reports-reject", { id: VALID_REPORT_ID }));
      await runner.waitFor(jobId);
      expect(calls[0]!.command).toBe(process.execPath);
      expect(calls[0]!.args).toEqual([tsxEntry(), "src/cli.ts", "reports-reject", VALID_REPORT_ID]);
    });
  });

  describe("job lifecycle", () => {
    it("runs running → succeeded with merged logTail and timestamps", async () => {
      const { calls, impl } = captureSpawn(LIFECYCLE_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("screen", {}));
      expect(jobId).toMatch(/^job-/);

      const running = runner.get(jobId);
      expect(running).toBeDefined();
      expect(running!.status).toBe("running");
      expect(running!.name).toBe("screen");
      expect(running!.startedAt).toBe(FIXED_NOW.toISOString());
      expect(running!.endedAt).toBeUndefined();

      const record = await runner.waitFor(jobId);
      expect(record.status).toBe("succeeded");
      expect(record.exitCode).toBe(0);
      expect(record.endedAt).toBe(FIXED_NOW.toISOString());
      expect(record.logTail[0]).toContain("[job] step 1/1");
      expect(record.logTail).toContain("out-line");
      expect(record.logTail).toContain("err-line");
      expect(calls).toHaveLength(1);
    });

    it("marks a non-zero exit as failed with the exit code", async () => {
      const { impl } = captureSpawn(FAIL_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("screen", {}));
      const record = await runner.waitFor(jobId);
      expect(record.status).toBe("failed");
      expect(record.exitCode).toBe(3);
      expect(record.endedAt).toBeDefined();
    });

    it("returns snapshots that do not leak internal mutable state", async () => {
      const { impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("screen", {}));
      const record = await runner.waitFor(jobId);
      record.logTail.push("tampered");
      expect(runner.get(jobId)!.logTail).not.toContain("tampered");
    });
  });

  describe("single concurrency", () => {
    it("returns 409 with runningJobId while busy and frees the slot after completion", async () => {
      const { impl } = captureSpawn(SLOW_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const firstId = expectStarted(await runner.start("screen", {}));

      const busy = await runner.start("consensus-archive", {});
      expect(busy.ok).toBe(false);
      if (busy.ok) throw new Error("expected busy outcome");
      expect(busy.status).toBe(409);
      expect(busy.error).toBe("已有任务运行中");
      expect(busy.runningJobId).toBe(firstId);

      await runner.waitFor(firstId);
      const secondId = expectStarted(await runner.start("consensus-archive", {}));
      const second = await runner.waitFor(secondId);
      expect(second.status).toBe("succeeded");
    });
  });

  describe("logTail ring buffer", () => {
    it("keeps only the last 400 lines", async () => {
      const { impl } = captureSpawn(MANY_LINES_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("screen", {}));
      const record = await runner.waitFor(jobId);
      // 450 行输出 + 1 行 step 标记 = 451 行，环形缓冲截断后只剩最后 400 行。
      expect(record.logTail).toHaveLength(400);
      expect(record.logTail[0]).toBe("line-50");
      expect(record.logTail[record.logTail.length - 1]).toBe("line-449");
    });
  });

  describe("backtest 两步串行与 codes 推导", () => {
    it("derives SH/SZ codes from the latest screen run and filters BJ codes", async () => {
      await fs.mkdir(path.join(rootDir, "reports"), { recursive: true });
      const older = {
        runId: "screen-2026-06-01T01-00-00-000Z",
        generatedAt: "2026-06-01T01:00:00.000Z",
        candidates: [{ stock: { code: "601111", name: "旧候选" } }],
      };
      const newer = {
        runId: "screen-2026-07-01T01-00-00-000Z",
        generatedAt: "2026-07-01T01:00:00.000Z",
        candidates: [
          { stock: { code: "600519", name: "沪市" } },
          { stock: { code: "830001", name: "北交所（滤掉）" } },
          { stock: { code: "000002", name: "深市主板" } },
          { stock: { code: "430047", name: "北交所（滤掉）" } },
          { stock: { code: "300308", name: "创业板" } },
          { stock: { code: "920099", name: "北交所（滤掉）" } },
          { stock: { code: "600519", name: "重复（去重）" } },
          { stock: {} },
          { stock: { code: "12345", name: "位数不足" } },
        ],
      };
      await fs.writeFile(path.join(rootDir, "reports", `${older.runId}.json`), JSON.stringify(older));
      await fs.writeFile(path.join(rootDir, "reports", `${newer.runId}.json`), JSON.stringify(newer));

      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("backtest", {}));
      const record = await runner.waitFor(jobId);
      expect(record.status).toBe("succeeded");
      expect(calls).toHaveLength(2);

      const expectedEnd = compactLocalDate(FIXED_NOW);
      const expectedBeg = compactLocalDate(new Date(FIXED_NOW.getTime() - 180 * 86_400_000));
      expect(calls[0]!.command).toBe(process.execPath);
      expect(calls[0]!.args).toEqual(["scripts/fetch-quant-history.mjs", "SH:600519,SZ:000002,SZ:300308", expectedBeg, expectedEnd]);
      // 旧 run 与 BJ 代码绝不允许混入
      expect(calls[0]!.args[1]).not.toContain("601111");
      expect(calls[0]!.args[1]).not.toContain("830001");

      expect(calls[1]!.command).toBe(process.execPath);
      expect(calls[1]!.args).toEqual([
        tsxEntry(),
        "src/cli.ts",
        "quant-adapt-history",
        "--prices",
        "data/quant/history.csv",
        "--benchmark",
        "data/quant/benchmark.csv",
        "--run",
      ]);
    });

    it("falls back to the script defaults when no screen run is readable", async () => {
      const { calls, impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("backtest", {}));
      await runner.waitFor(jobId);
      // codes 推导不出来 → 不传任何位置参数，完全落回脚本内置默认。
      expect(calls[0]!.command).toBe(process.execPath);
      expect(calls[0]!.args).toEqual(["scripts/fetch-quant-history.mjs"]);
    });

    it("stops after the first failing step", async () => {
      let callIndex = 0;
      const impl: JobSpawnImpl = (_command, _args, options) => {
        callIndex += 1;
        return spawn(process.execPath, ["-e", FAIL_SCRIPT], options);
      };
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("backtest", {}));
      const record = await runner.waitFor(jobId);
      expect(record.status).toBe("failed");
      expect(record.exitCode).toBe(3);
      expect(callIndex).toBe(1);
    });
  });

  describe("审计与超时", () => {
    it("appends an audit line to runs/panel-jobs.jsonl after each job settles", async () => {
      const ok = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: ok.impl, now: () => FIXED_NOW });
      const jobId = expectStarted(await runner.start("screen", {}));
      await runner.waitFor(jobId);

      // 校验失败的请求（400）不产生审计行
      await runner.start("reports-accept", { id: "not-valid" });

      const fail = captureSpawn(FAIL_SCRIPT);
      const failRunner = createJobRunner({ rootDir, spawnImpl: fail.impl, now: () => FIXED_NOW });
      const failedId = expectStarted(await failRunner.start("consensus-archive", {}));
      await failRunner.waitFor(failedId);

      const raw = await fs.readFile(path.join(rootDir, "runs", "panel-jobs.jsonl"), "utf8");
      const lines = raw.trim().split("\n").map((line) => JSON.parse(line));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({ type: "panel-job", id: jobId, name: "screen", status: "succeeded", exitCode: 0 });
      expect(lines[0].startedAt).toBe(FIXED_NOW.toISOString());
      expect(lines[0].endedAt).toBe(FIXED_NOW.toISOString());
      expect(lines[1]).toMatchObject({ type: "panel-job", id: failedId, name: "consensus-archive", status: "failed", exitCode: 3 });
    });

    it("kills a step that exceeds the timeout and marks the job failed", async () => {
      const { impl } = captureSpawn(HANG_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => FIXED_NOW, stepTimeoutMs: 150 });
      const jobId = expectStarted(await runner.start("screen", {}));
      const record = await runner.waitFor(jobId);
      expect(record.status).toBe("failed");
      expect(record.exitCode).toBeUndefined();
      expect(record.logTail.some((line) => line.includes("超时"))).toBe(true);
    });
  });

  describe("job listing", () => {
    it("lists jobs by startedAt descending and honors limit", async () => {
      let currentMs = FIXED_NOW.getTime();
      const { impl } = captureSpawn(FAST_SCRIPT);
      const runner = createJobRunner({ rootDir, spawnImpl: impl, now: () => new Date(currentMs) });

      const firstId = expectStarted(await runner.start("screen", {}));
      await runner.waitFor(firstId);
      currentMs += 60_000;
      const secondId = expectStarted(await runner.start("consensus-archive", {}));
      await runner.waitFor(secondId);

      const jobs = runner.list();
      expect(jobs.map((job) => job.id)).toEqual([secondId, firstId]);
      expect(runner.list(1).map((job) => job.id)).toEqual([secondId]);
    });
  });
});
