// Chat 模块级 store（订阅模式借鉴 ui/Toast 的单例队列做法）。
//
// 为什么不用组件 state：Layout 在抽屉关闭时会卸载 ChatDrawer（{chatOpen && <ChatDrawer/>}），
// 组件级 state 会导致关闭抽屉即丢历史、请求进行中关闭即丢回复。
// 模块级 store 让消息与"发送中"状态跨开合存活；同时把会话 id 与消息
// 持久化到 localStorage（chat-server 只存转录、无读取历史的端点，客户端自存是唯一恢复途径）。

import { toast } from "@/components/ui/Toast";
import { postChat, postReset } from "@/components/chat/chatApi";
import type { ToolExecutionTrace } from "@/components/chat/chatApi";
import { useEffect, useState } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 助手消息：本轮工具执行轨迹。 */
  toolExecutions?: ToolExecutionTrace[];
  /** 助手消息：模型侧错误（与 reply 并存，reply 可能为空）。 */
  errorMessage?: string;
  /** 用户消息：发送失败，可重试。 */
  failed?: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  sending: boolean;
  /** 最近一次传输层错误（发送失败时内联展示 + 重试）。 */
  error: string | null;
  /** 首轮回复后可知的模型标识，如 "anthropic/claude-..."。 */
  modelLabel: string | null;
}

const SESSION_KEY = "serenity-panel-chat-session";
const MESSAGES_KEY = "serenity-panel-chat-messages";
const MAX_PERSISTED_MESSAGES = 50;

let nextId = 0;
function makeId(): string {
  nextId += 1;
  return `m-${Date.now().toString(36)}-${nextId}`;
}

/** 会话 id：localStorage 持久化；服务端会过 safeFilename，字符集保持保守。 */
export function getChatSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return "panel"; // localStorage 不可用（隐私模式等）时退化为固定会话
  }
}

function loadPersistedMessages(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ChatMessage =>
        typeof m === "object" &&
        m !== null &&
        ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
        typeof (m as ChatMessage).content === "string" &&
        typeof (m as ChatMessage).id === "string",
    );
  } catch {
    return [];
  }
}

function persistMessages(messages: ChatMessage[]): void {
  try {
    window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.slice(-MAX_PERSISTED_MESSAGES)));
  } catch {
    // 配额/隐私模式下静默降级：仅内存态
  }
}

let state: ChatState = {
  messages: loadPersistedMessages(),
  sending: false,
  error: null,
  modelLabel: null,
};

const listeners = new Set<(s: ChatState) => void>();

function setState(patch: Partial<ChatState>): void {
  state = { ...state, ...patch };
  if (patch.messages) persistMessages(state.messages);
  listeners.forEach((fn) => fn(state));
}

/** React 订阅入口：返回当前 ChatState，随 store 更新重渲染。 */
export function useChatStore(): ChatState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    setSnapshot(state); // mount 与首次订阅之间可能有更新，先同步一次
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}

async function deliver(userMessage: ChatMessage): Promise<void> {
  try {
    const result = await postChat({ sessionId: getChatSessionId(), message: userMessage.content });
    const assistant: ChatMessage = {
      id: makeId(),
      role: "assistant",
      content: result.reply,
      toolExecutions: result.toolExecutions.length > 0 ? result.toolExecutions : undefined,
      errorMessage: result.errorMessage,
    };
    setState({
      messages: [
        ...state.messages.map((m) => (m.id === userMessage.id ? { ...m, failed: false } : m)),
        assistant,
      ],
      sending: false,
      error: null,
      modelLabel: `${result.modelProvider}/${result.modelName}`,
    });
  } catch (error: unknown) {
    setState({
      messages: state.messages.map((m) => (m.id === userMessage.id ? { ...m, failed: true } : m)),
      sending: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** 发送新消息：追加用户气泡并进入发送中；失败标记 failed 供重试。 */
export async function sendChatMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || state.sending) return;
  const userMessage: ChatMessage = { id: makeId(), role: "user", content: trimmed };
  setState({ messages: [...state.messages, userMessage], sending: true, error: null });
  await deliver(userMessage);
}

/** 重试最近一条发送失败的用户消息（不重复追加气泡）。 */
export async function retryLastFailedMessage(): Promise<void> {
  if (state.sending) return;
  const lastFailed = [...state.messages].reverse().find((m) => m.role === "user" && m.failed);
  if (!lastFailed) return;
  setState({
    messages: state.messages.map((m) => (m.id === lastFailed.id ? { ...m, failed: false } : m)),
    sending: true,
    error: null,
  });
  await deliver(lastFailed);
}

/** 清空会话：POST /reset 清服务端转录，成功后清空本地消息。 */
export async function clearChatSession(): Promise<void> {
  if (state.sending) return;
  try {
    await postReset(getChatSessionId());
    setState({ messages: [], error: null });
    toast("会话已清空", "success");
  } catch (error: unknown) {
    toast(`清空会话失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}
