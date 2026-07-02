// 飞书图片媒体辅助:从消息下载图片、上传图片拿 image_key、把图片/文本发到会话。
// 复用 feishu.ts 的 token 获取与发消息封装。

import { getTenantAccessToken, postFeishuChatMessage } from "./feishu.js";

const FEISHU_BASE = "https://open.feishu.cn/open-apis";
const MAX_FEISHU_IMAGE_BYTES = 15 * 1024 * 1024;

/** 下载某条消息里的图片资源,返回 base64 + mime。 */
export async function downloadFeishuMessageImage(
  appId: string,
  appSecret: string,
  messageId: string,
  imageKey: string,
): Promise<{ b64: string; mime: string }> {
  const token = await getTenantAccessToken(appId, appSecret);
  const url = `${FEISHU_BASE}/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(imageKey)}?type=image`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`feishu image download failed: ${res.status} ${await res.text()}`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared && declared > MAX_FEISHU_IMAGE_BYTES) throw new Error(`feishu image too large: ${declared} bytes`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FEISHU_IMAGE_BYTES) throw new Error(`feishu image too large: ${buf.length} bytes`);
  const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
  return { b64: buf.toString("base64"), mime };
}

/** 上传图片到飞书,返回 image_key(用于发图片消息)。 */
export async function uploadFeishuImage(appId: string, appSecret: string, bytes: Buffer): Promise<string> {
  const token = await getTenantAccessToken(appId, appSecret);
  const form = new FormData();
  form.append("image_type", "message");
  form.append("image", new Blob([new Uint8Array(bytes)]), "image.png");
  const res = await fetch(`${FEISHU_BASE}/im/v1/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`feishu image upload failed: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  const imageKey = data?.data?.image_key;
  if (!imageKey) throw new Error(`feishu image upload: no image_key (${JSON.stringify(data).slice(0, 160)})`);
  return imageKey;
}

/** 发一条图片消息到会话。 */
export async function sendFeishuImageToChat(
  appId: string,
  appSecret: string,
  chatId: string,
  imageKey: string,
): Promise<void> {
  const token = await getTenantAccessToken(appId, appSecret);
  await postFeishuChatMessage(token, chatId, {
    msg_type: "image",
    content: JSON.stringify({ image_key: imageKey }),
  });
}

/** 发一条纯文本消息到会话(用于生图过程的进度提示）。 */
export async function sendFeishuTextToChat(
  appId: string,
  appSecret: string,
  chatId: string,
  text: string,
): Promise<void> {
  const token = await getTenantAccessToken(appId, appSecret);
  await postFeishuChatMessage(token, chatId, {
    msg_type: "text",
    content: JSON.stringify({ text }),
  });
}
