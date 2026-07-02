// Adapted from tickflow-stock-panel (MIT) — 模块级单例队列 + 订阅式容器的全局 toast 模式。
// 色彩改为 tokens：raised 底 + 语义色左条，不使用字面量色值。
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type ToastKind = "error" | "success" | "info";

interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}

const TOAST_TTL_MS = 4000;

let nextId = 0;
let queue: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit(): void {
  listeners.forEach((fn) => fn([...queue]));
}

export function toast(msg: string, kind: ToastKind = "info"): void {
  const item: ToastItem = { id: ++nextId, msg, kind };
  queue = [...queue, item];
  emit();
  setTimeout(() => {
    queue = queue.filter((t) => t.id !== item.id);
    emit();
  }, TOAST_TTL_MS);
}

const kindBar: Record<ToastKind, string> = {
  error: "bg-danger",
  success: "bg-accent",
  info: "bg-ink-3",
};

/** Toast 容器 — 挂在 Layout 最顶层，全局唯一。 */
export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const subscribe = useCallback(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  useEffect(subscribe, [subscribe]);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-stretch overflow-hidden rounded-card border border-line-strong bg-raised shadow-raised"
        >
          <span className={cn("w-1 shrink-0", kindBar[t.kind])} />
          <span className="px-4 py-2.5 text-sm text-ink">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
