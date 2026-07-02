// 右侧抽屉（overlay 第四级 surface + shadow-overlay）：backdrop 点击 / Esc 关闭。
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** 抽屉宽度类，默认 w-[26rem]（移动端自动收到全宽）。 */
  widthClassName?: string;
}

export function Drawer({ open, onClose, title, children, widthClassName = "w-[26rem]" }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999]">
      <button
        type="button"
        aria-label="关闭抽屉"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-base/60"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-line-strong bg-overlay shadow-overlay",
          widthClassName,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-btn p-1 text-ink-3 transition-colors duration-fast ease-smooth hover:bg-raised hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
