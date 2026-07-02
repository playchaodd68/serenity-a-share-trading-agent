// Minimal injectable LLM client for single-shot research passes (bear case, judge).
// Deterministic tests inject a fake; runtime uses the OpenAI-compatible DeepSeek API.

export interface LlmCompletionInput {
  system: string;
  user: string;
}

export interface LlmClient {
  label: string;
  complete(input: LlmCompletionInput): Promise<string>;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_TIMEOUT_MS = 120_000;

export interface DeepSeekClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}

export function createDeepSeekClient(options: DeepSeekClientOptions = {}): LlmClient {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const baseUrl = (options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = options.model ?? process.env.TRADING_AGENT_MODEL ?? "deepseek-v4-pro";
  const temperature = options.temperature ?? 0.3;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    label: `deepseek/${model}`,
    async complete(input: LlmCompletionInput): Promise<string> {
      if (!apiKey) {
        throw new Error("DEEPSEEK_API_KEY is not configured; cannot run the live LLM pass.");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.user },
            ],
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`DeepSeek API error ${response.status}: ${body.slice(0, 300)}`);
        }
        const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new Error("DeepSeek API returned an empty completion.");
        return content;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
