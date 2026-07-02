// Chat 抽屉（蓝图 §2.7）：右下角唤起，接既有 POST /chat（非流式）与 POST /reset。
// 接口约定（勿改）：props { open, onClose }；由 Layout 右下角按钮 lazy 加载。
//
// 抽屉壳采用 overlay 层 token + shadow-overlay，交互模式（backdrop / Esc / role=dialog）
// 与 ui/Drawer 一致；不直接复用 ui/Drawer 是因为它的 body 是单一带 padding 的滚动区，
// 无法承载"消息区滚动 + 底部固定输入框 + 页头操作位"的对话布局（共享文件不可改）。
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eraser, Loader2, MessageSquare, Send, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageBubble } from "@/components/chat/MessageBubble";
import {
  clearChatSession,
  retryLastFailedMessage,
  sendChatMessage,
  useChatStore,
} from "@/components/chat/chatStore";

export interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

const CLEAR_CONFIRM_TTL_MS = 3000;

/** 清空会话：两步确认（首击变"确认清空?"，3s 内再击执行），避免误触毁掉转录。 */
function ClearSessionButton({ disabled }: { disabled: boolean }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CLEAR_CONFIRM_TTL_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void clearChatSession();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 rounded-btn border px-2 py-1 text-2xs transition-colors duration-fast ease-smooth",
        confirming
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <Eraser className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      {confirming ? "确认清空？" : "清空会话"}
    </button>
  );
}

export default function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  const { messages, sending, error, modelLabel } = useChatStore();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Esc 关闭 + 打开时聚焦输入框
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 新消息 / 发送状态变化时滚动到底部
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, open]);

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    void sendChatMessage(text);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送、Shift+Enter 换行；isComposing 保护中文输入法候选确认
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999]">
      <button
        type="button"
        aria-label="关闭对话"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-base/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="研究助手"
        className="absolute inset-y-0 right-0 flex w-[28rem] max-w-full flex-col border-l border-line-strong bg-overlay shadow-overlay"
      >
        {/* 页头：标题 + 模型标识 + 清空会话 + 关闭 */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">研究助手</h2>
          {modelLabel && (
            <span className="num min-w-0 truncate text-2xs text-ink-3" title={modelLabel}>
              {modelLabel}
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ClearSessionButton disabled={sending} />
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="rounded-btn p-1 text-ink-3 transition-colors duration-fast ease-smooth hover:bg-raised hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* 消息区 */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !sending ? (
            <EmptyState
              icon={MessageSquare}
              title="开始与研究助手对话"
              hint={
                <>
                  接入既有 /chat 服务（非流式），助手可调用研究工具并展示执行轨迹。
                  <br />
                  例如：「用 Serenity 方法论解释今天候选池里最应该先研究哪三家公司」
                </>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-card rounded-bl-input border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    思考中，可能涉及工具调用，请稍候…
                  </div>
                </div>
              )}

              {error && !sending && (
                <div className="flex items-center gap-2 rounded-card border border-danger/30 bg-danger/10 px-3 py-2 text-2xs text-danger">
                  <span className="min-w-0 flex-1 break-all">发送失败：{error}</span>
                  <button
                    type="button"
                    onClick={() => void retryLastFailedMessage()}
                    className="shrink-0 rounded-btn border border-danger/40 px-2 py-0.5 font-medium transition-colors duration-fast ease-smooth hover:bg-danger/15"
                  >
                    重试
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部输入区（固定） */}
        <form
          className="border-t border-line px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="输入你的 A 股产业研究问题…"
              aria-label="对话输入"
              className={cn(
                "min-h-0 flex-1 resize-none rounded-input border border-line bg-base/60 px-3 py-2 text-sm text-ink placeholder:text-ink-3",
                "transition-colors duration-fast ease-smooth focus:border-line-strong focus:outline-none",
              )}
            />
            <button
              type="submit"
              disabled={sending || draft.trim() === ""}
              aria-label="发送"
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-btn border border-line-strong bg-raised text-ink-2",
                "transition-all duration-fast ease-smooth hover:text-accent",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink-2",
              )}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-2xs text-ink-3">Enter 发送 · Shift+Enter 换行 · 回复为非流式，复杂问题可能需数十秒</p>
        </form>
      </div>
    </div>,
    document.body,
  );
}
