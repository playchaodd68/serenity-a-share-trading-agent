import type { TradingChatSession } from "../chatbot/chatbot.js";
import {
  buildHermesTradingSubagentMetadata,
  createHermesTradingSubagentSession,
  promptHermesTradingSubagent,
  renderHermesTradingSubagentMetadata,
  resetHermesTradingSubagentSession,
} from "./trading-subagent.js";

export interface HermesTradingFeishuRouterOptions {
  directFfdQuery?: (query: string) => Promise<string> | string;
  shouldRouteDirectlyToFfd?: (text: string) => boolean;
}

export class HermesTradingFeishuRouter {
  private readonly chatSessions = new Map<string, TradingChatSession>();

  constructor(private readonly options: HermesTradingFeishuRouterOptions = {}) {}

  async getSession(sessionId: string): Promise<TradingChatSession> {
    const existing = this.chatSessions.get(sessionId);
    if (existing) return existing;
    const session = await createHermesTradingSubagentSession(`feishu-${sessionId}`);
    this.chatSessions.set(sessionId, session);
    return session;
  }

  async ask(sessionId: string, question: string): Promise<string> {
    if (!question.trim()) return "Usage: /ask <question>";
    if (this.options.directFfdQuery && this.options.shouldRouteDirectlyToFfd?.(question)) {
      return this.options.directFfdQuery(question);
    }
    const session = await this.getSession(sessionId);
    const localizedQuestion = [
      "请默认使用简体中文回答，除非我明确要求其他语言；不要使用繁体字。",
      "",
      question,
    ].join("\n");
    const result = await promptHermesTradingSubagent(session, localizedQuestion);
    return result.errorMessage ? `Agent error: ${result.errorMessage}` : result.reply;
  }

  async reset(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    await resetHermesTradingSubagentSession(session);
    return "Hermes trading subagent session reset.";
  }

  async metadata(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    return renderHermesTradingSubagentMetadata(buildHermesTradingSubagentMetadata(session));
  }

  async handleAgentCommand(command: string, arg: string, sessionId: string): Promise<string | undefined> {
    switch (command.toLowerCase()) {
      case "/ask":
      case "/chat":
      case "/trading":
      case "/hermes":
        return this.ask(sessionId, arg);
      case "/reset":
        return this.reset(sessionId);
      case "/hermes-metadata":
      case "/agent-metadata":
        return this.metadata(sessionId);
      default:
        return undefined;
    }
  }
}

export function createHermesTradingFeishuRouter(options: HermesTradingFeishuRouterOptions = {}): HermesTradingFeishuRouter {
  return new HermesTradingFeishuRouter(options);
}
