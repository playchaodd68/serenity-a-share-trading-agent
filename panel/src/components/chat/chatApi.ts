// Chat 局部 API 客户端（仅 components/chat/ 内使用）。
//
// 为什么不复用共享 lib/api.ts：
// 1. 其 ChatResponse.toolExecutions 类型为 { name, detail? }，与 chat-server 实际返回
//    （src/chatbot/chatbot.ts TradingChatTurnResult：{ toolCallId, toolName, args?, ok? }）不符；
// 2. 缺少 /reset 端点封装。
// 共享文件不属于 S6 可改范围，故按服务端实测 schema 在此局部实现（已在 openIssues 注明）。
//
// 错误约定：非 2xx 返回 { error: string }（"already processing" → 409）；
// 此处不弹全局 toast——对话错误在抽屉内联展示并提供重试。

/** 单次工具执行轨迹（与 src/chatbot/chatbot.ts ToolExecutionTrace 对齐）。 */
export interface ToolExecutionTrace {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  /** undefined = 未结束；true/false = 成功/失败。 */
  ok?: boolean;
}

/** POST /chat 响应（与 TradingChatTurnResult 对齐；usage 字段面板不消费，省略）。 */
export interface ChatTurnResult {
  sessionId: string;
  reply: string;
  modelProvider: string;
  modelName: string;
  toolExecutions: ToolExecutionTrace[];
  errorMessage?: string;
}

/** POST /reset 响应。 */
export interface ChatResetResult {
  ok: boolean;
  sessionId: string;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json() as Promise<T>;
}

/** 发送一轮对话（非流式；复杂问题因工具调用可能耗时数十秒）。 */
export function postChat(payload: { sessionId: string; message: string }): Promise<ChatTurnResult> {
  return postJson<ChatTurnResult>("/chat", payload);
}

/** 清空服务端会话转录（对应 CLI /reset 语义：agent.reset() + 落盘）。 */
export function postReset(sessionId: string): Promise<ChatResetResult> {
  return postJson<ChatResetResult>("/reset", { sessionId });
}
