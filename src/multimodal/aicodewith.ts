// aicodewith 多模态客户端:gpt-5.5 视觉理解 + gpt-image-2 文生图。
// 纯外部 API 封装,不依赖飞书。供「图片输入→视觉分析」「/draw→生图」两条路使用。

export interface AicodewithMultimodalConfig {
  apiKey: string;
  /** 形如 https://api.aicodewith.com/v1 */
  baseUrl: string;
  /** 视觉模型,默认 gpt-5.5 */
  visionModel: string;
  /** 文生图模型,默认 gpt-image-2 */
  imageModel: string;
}

export interface ImageInput {
  b64: string;
  mime: string;
}

function authHeaders(cfg: AicodewithMultimodalConfig): Record<string, string> {
  return { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** gpt-5.5 视觉:把若干图片 + 问题发给视觉模型,返回文字分析。 */
export async function analyzeImagesWithVision(
  cfg: AicodewithMultimodalConfig,
  images: ImageInput[],
  question: string,
  systemPrompt?: string,
): Promise<string> {
  if (images.length === 0) throw new Error("analyzeImagesWithVision: no images");
  const userContent: unknown[] = [{ type: "text", text: question }];
  for (const img of images) {
    userContent.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.b64}` } });
  }
  const messages: unknown[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userContent });

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ model: cfg.visionModel, messages, max_tokens: 4000 }),
    signal: AbortSignal.timeout(280_000),
  });
  if (!res.ok) throw new Error(`vision request failed: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p: any) => p?.text ?? "").join("");
  return "";
}

/** 从任务/结果对象里挖出第一张图片的 url。 */
function firstImageUrl(obj: any): string | undefined {
  const buckets = [obj?.result_data, obj?.results, obj?.data, obj?.output];
  for (const arr of buckets) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const url = typeof item === "string" ? item : item?.url ?? item?.image_url;
      if (typeof url === "string" && url) return url;
    }
  }
  return undefined;
}

/** gpt-image-2 文生图(异步任务制):提交→轮询 /tasks/{id} 直到完成,返回图片 url。 */
export async function generateImage(
  cfg: AicodewithMultimodalConfig,
  prompt: string,
  opts: { size?: string; pollMs?: number; maxWaitMs?: number } = {},
): Promise<{ url: string }> {
  const size = opts.size ?? "1024x1024";
  const pollMs = opts.pollMs ?? 6000;
  const maxWaitMs = opts.maxWaitMs ?? 180_000;

  const submitRes = await fetch(`${cfg.baseUrl}/images/generations`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ model: cfg.imageModel, prompt, n: 1, size }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!submitRes.ok) throw new Error(`image submit failed: ${submitRes.status} ${await submitRes.text()}`);
  const task: any = await submitRes.json();

  // 少数情况下可能同步返回图片
  const direct = firstImageUrl(task);
  if (direct) return { url: direct };

  const taskId = task?.id;
  if (!taskId) throw new Error(`image task: no id and no data (${JSON.stringify(task).slice(0, 160)})`);

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await delay(pollMs);
    const res = await fetch(`${cfg.baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`image poll failed: ${res.status} ${await res.text()}`);
    const t: any = await res.json();
    const status = String(t?.status ?? "");
    if (["completed", "succeeded", "success"].includes(status)) {
      const url = firstImageUrl(t);
      if (!url) throw new Error("image task completed but no url found");
      return { url };
    }
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(`image task ${status}: ${JSON.stringify(t?.error ?? t).slice(0, 200)}`);
    }
  }
  throw new Error(`image task timed out after ${Math.round(maxWaitMs / 1000)}s`);
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** 仅允许 aicodewith 同主机/同注册域(防 SSRF + 防把 key 发给任意主机)。 */
function isAllowedImageHost(target: URL, baseUrl: string): boolean {
  let baseHost: string;
  try {
    baseHost = new URL(baseUrl).hostname;
  } catch {
    return false;
  }
  if (target.hostname === baseHost) return true;
  const registrable = baseHost.split(".").slice(-2).join(".");
  return target.hostname === registrable || target.hostname.endsWith(`.${registrable}`);
}

/**
 * 下载生成的图片字节。URL 来自 aicodewith 任务结果(外部数据),因此:
 * 只允许 https、只允许 aicodewith 主机(拒绝其他主机以防 SSRF),
 * 且仅对该主机附带 Bearer key,并限制最大字节数。
 */
export async function downloadImageBytes(
  cfg: AicodewithMultimodalConfig,
  url: string,
): Promise<{ bytes: Buffer; mime: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("image download: invalid url");
  }
  if (parsed.protocol !== "https:") throw new Error("image download: non-https url refused");
  if (!isAllowedImageHost(parsed, cfg.baseUrl)) {
    throw new Error(`image download: host not allowed (${parsed.hostname})`);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`image download failed: ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared && declared > MAX_IMAGE_BYTES) throw new Error(`image too large: ${declared} bytes`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`image too large: ${bytes.length} bytes`);
  const mime = res.headers.get("content-type") ?? "image/png";
  return { bytes, mime };
}
