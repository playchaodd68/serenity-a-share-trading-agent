// 轻量确认弹窗（居中 modal）：backdrop 点击 / Esc 取消，危险动作 danger 主按钮。
// 与 Drawer 同一 overlay 层级语义（bg-overlay + shadow-overlay + rounded-dialog）。
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 说明文案（正文区）。 */
  description?: ReactNode;
  /** 附加内容（如"强制接受"勾选项），渲染在说明之后、按钮之前。 */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险动作：确认键使用 danger 色。 */
  danger?: boolean;
  /** 提交中：双按钮禁用，防重复确认。 */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    // 聚焦面板本体而非确认键，避免误触回车直接执行危险动作
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] grid place-items-center p-4">
      <button
        type="button"
        aria-label="取消并关闭"
        onClick={onCancel}
        className="absolute inset-0 h-full w-full cursor-default bg-base/60"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-dialog border border-line-strong bg-overlay p-5 shadow-overlay"
      >
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <div className="mt-2 text-sm leading-relaxed text-ink-2">{description}</div>}
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={cn(
              "rounded-btn border border-line-strong bg-transparent px-3 py-1.5 text-xs text-ink-2",
              "transition-colors duration-fast ease-smooth",
              "hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "rounded-btn border border-transparent px-3 py-1.5 text-xs font-medium text-[color:var(--color-base)]",
              "transition-colors duration-fast ease-smooth disabled:cursor-not-allowed disabled:opacity-50",
              danger ? "bg-danger hover:bg-danger/85" : "bg-accent hover:bg-accent/85",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
