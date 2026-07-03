// 通用动作按钮：点击 →（可选确认弹窗）→ POST /api/actions/:name → 内联 spinner「运行中」
// → 终态由 useJobRunner 统一 toast + 失效缓存；失败时提供日志抽屉（logTail 等宽滚动）。
// 全局忙（任意任务运行中）时所有 JobButton 禁用，防并发。
import { useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { toast } from "@/components/ui/Toast";
import { JobConflictError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtDateTime } from "@/lib/format";
import { useJobRunner } from "@/lib/useJobRunner";
import type { JobActionName, JobRecord } from "@/lib/types";

export interface JobButtonProps {
  action: JobActionName;
  params?: Record<string, unknown>;
  label: string;
  /** 有值则点击先弹确认框，此文案为确认说明。 */
  confirmText?: string;
  /** 确认框标题，缺省用 label。 */
  confirmTitle?: string;
  /** 确认框内附加勾选项：勾选后向 params 合并 { [param]: true }（如强制接受 force）。 */
  confirmCheckbox?: { label: string; param: string };
  /** 危险动作：danger 配色 + 确认键 danger 色。 */
  danger?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  className?: string;
}

type Phase = "idle" | "starting" | "running";

const sizeClass: Record<NonNullable<JobButtonProps["size"]>, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-xs",
  lg: "px-4 py-2 text-sm",
};

const iconSizeClass: Record<NonNullable<JobButtonProps["size"]>, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

function variantClass(variant: NonNullable<JobButtonProps["variant"]>, danger: boolean): string {
  switch (variant) {
    case "primary":
      return danger
        ? "border-transparent bg-danger font-medium text-[color:var(--color-base)] hover:bg-danger/85"
        : "border-transparent bg-accent font-medium text-[color:var(--color-base)] hover:bg-accent/85";
    case "secondary":
      return danger
        ? "border-line-strong bg-raised text-danger hover:border-danger hover:bg-danger/10"
        : "border-line-strong bg-raised text-ink hover:border-accent hover:text-accent";
    case "ghost":
      return danger
        ? "border-transparent text-danger hover:bg-danger/10"
        : "border-transparent text-ink-2 hover:bg-raised hover:text-ink";
  }
}

/** 参数稳定序列化（键排序），用于把列表轮询中的 running 任务对回本按钮。 */
function stableParams(value: Record<string, unknown> | undefined): string {
  const obj = value ?? {};
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function JobButton({
  action,
  params,
  label,
  confirmText,
  confirmTitle,
  confirmCheckbox,
  danger = false,
  variant = "secondary",
  size = "md",
  icon: Icon,
  className,
}: JobButtonProps) {
  const { runningJob, busy, start, watch } = useJobRunner();

  const [phase, setPhase] = useState<Phase>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [failedJob, setFailedJob] = useState<JobRecord | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  // 本按钮对应的任务正在运行（含从其它页面/标签页发起的同名同参任务）→ spinner +「运行中」
  const matchesRunning =
    runningJob !== undefined &&
    runningJob.name === action &&
    stableParams(runningJob.params) === stableParams(params);
  const active = phase !== "idle" || matchesRunning;
  const disabled = busy || phase !== "idle";

  const run = async (finalParams?: Record<string, unknown>) => {
    setFailedJob(null);
    setLogOpen(false);
    setPhase("starting");
    try {
      const jobId = await start(action, finalParams);
      setPhase("running");
      const job = await watch(jobId);
      if (job.status === "failed") setFailedJob(job);
    } catch (error) {
      if (error instanceof JobConflictError) {
        toast("已有任务运行中", "error");
      } else {
        toast(error instanceof Error ? error.message : "动作启动失败", "error");
      }
    } finally {
      setPhase("idle");
    }
  };

  const needsConfirm = Boolean(confirmText) || Boolean(confirmCheckbox);

  const handleClick = () => {
    if (disabled) return;
    if (needsConfirm) {
      setCheckboxChecked(false);
      setConfirmOpen(true);
    } else {
      void run(params);
    }
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    const merged =
      confirmCheckbox && checkboxChecked ? { ...(params ?? {}), [confirmCheckbox.param]: true } : params;
    void run(merged);
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-busy={active}
        title={busy && !active ? "已有任务运行中，请稍候" : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-btn border transition-colors duration-fast ease-smooth",
          "disabled:cursor-not-allowed disabled:opacity-55",
          sizeClass[size],
          variantClass(variant, danger),
        )}
      >
        {active ? (
          <Loader2 className={cn(iconSizeClass[size], "animate-spin")} aria-hidden />
        ) : (
          Icon && <Icon className={iconSizeClass[size]} aria-hidden />
        )}
        {active ? "运行中" : label}
      </button>

      {failedJob && (
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className={cn(
            "inline-flex items-center gap-1 rounded-btn border border-transparent px-1.5 py-1 text-2xs text-danger",
            "transition-colors duration-fast ease-smooth hover:bg-danger/10",
          )}
        >
          <ScrollText className="h-3 w-3" aria-hidden />
          查看日志
        </button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle ?? label}
        description={confirmText}
        danger={danger}
        confirmLabel={danger ? "确认执行" : "确认"}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      >
        {confirmCheckbox && (
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(event) => setCheckboxChecked(event.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            {confirmCheckbox.label}
          </label>
        )}
      </ConfirmDialog>

      <Drawer open={logOpen} onClose={() => setLogOpen(false)} title={`${label} · 失败日志`} widthClassName="w-[34rem]">
        {failedJob && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-3">
              <span>
                任务 <span className="num">{failedJob.id}</span>
              </span>
              {failedJob.exitCode !== undefined && (
                <span>
                  退出码 <span className="num text-danger">{failedJob.exitCode}</span>
                </span>
              )}
              <span>
                开始 <span className="num">{fmtDateTime(failedJob.startedAt)}</span>
              </span>
              {failedJob.endedAt && (
                <span>
                  结束 <span className="num">{fmtDateTime(failedJob.endedAt)}</span>
                </span>
              )}
            </div>
            <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-all rounded-card border border-line bg-base p-3 font-mono text-xs leading-relaxed text-ink-2">
              {failedJob.logTail.length > 0 ? failedJob.logTail.join("\n") : "（无日志输出）"}
            </pre>
          </div>
        )}
      </Drawer>
    </span>
  );
}
