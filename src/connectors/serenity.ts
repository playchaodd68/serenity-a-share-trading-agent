import type { SourceRecord } from "../types.js";

export interface SerenityPostSummary {
  id: string;
  url: string;
  observedAt: string;
  excerpt: string;
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ");
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTopicDiggPosts(html: string): SerenityPostSummary[] {
  const blocks = html.split('<div class="mb-4 p-4').slice(1);
  const posts = new Map<string, SerenityPostSummary>();
  for (const block of blocks) {
    const idMatch = block.match(/topicdigg\.com\/x\/aleabitoreddit\/(\d+)">([^<]+)<\/a>/);
    const textMatch = block.match(/id="clamp-(\d+)-0">([\s\S]*?)<\/div>\s*<div class="text-\[#2196f3\]/);
    if (!idMatch || !textMatch) continue;
    const id = idMatch[1];
    const observedAt = stripHtml(idMatch[2] ?? "");
    const excerpt = stripHtml(textMatch[2] ?? "").slice(0, 420);
    if (excerpt.length < 8) continue;
    posts.set(id, {
      id,
      url: `https://x.com/aleabitoreddit/status/${id}`,
      observedAt,
      excerpt,
    });
  }
  return [...posts.values()];
}

export async function fetchTopicDiggPostSummaries(): Promise<SerenityPostSummary[]> {
  const urls = [
    "https://topicdigg.com/x/aleabitoreddit",
    "https://topicdigg.com/account/tweet-list?page=2&size=20&account=aleabitoreddit&show_retweet=1",
  ];
  const pages = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, { headers: { "user-agent": "serenity-a-share-trading-agent/1.0" } });
      if (!response.ok) throw new Error(`TopicDigg request failed ${response.status}: ${url}`);
      return response.text();
    }),
  );
  const posts = new Map<string, SerenityPostSummary>();
  for (const page of pages) {
    for (const post of parseTopicDiggPosts(page)) posts.set(post.id, post);
  }
  return [...posts.values()].sort((a, b) => b.id.localeCompare(a.id));
}

export function serenityPostsToSources(posts: SerenityPostSummary[]): SourceRecord[] {
  return posts.map((post) => ({
    id: `SERENITY-X-POST-${post.id}`,
    title: `Serenity X post ${post.id}`,
    tier: "P2",
    sourceType: "social",
    publisher: "Serenity / X via TopicDigg mirror",
    observedAt: post.observedAt || new Date().toISOString().slice(0, 10),
    url: post.url,
    summary: post.excerpt,
    evidenceTags: ["Serenity", "x-post", "public-excerpt"],
  }));
}
