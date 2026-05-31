import { describe, expect, it } from "vitest";
import { parseTopicDiggPosts } from "../src/connectors/serenity.js";

describe("Serenity TopicDigg parser", () => {
  it("extracts post summaries from mirrored HTML", () => {
    const html = `<div class="mb-4 p-4 shadow-3xl">
      <a href="https://topicdigg.com/x/aleabitoreddit/123">2026.05.29 07:54</a>
      <div class="text-sm pt-2 line-clamp-2 dark:text-dark-font" id="clamp-123-0">
        $SIVE basically took their entire revenue pipeline.
      </div>
      <div class="text-[#2196f3] cursor-pointer text-sm mt-2 show-clamp">显示更多</div>
    </div>`;
    const posts = parseTopicDiggPosts(html);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("123");
    expect(posts[0]?.excerpt).toContain("$SIVE");
  });
});
