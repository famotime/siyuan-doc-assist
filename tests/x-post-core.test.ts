// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  extractXFirstParagraphTitle,
  extractXPostId,
  formatXPostMarkdown,
  isXPostUrl,
  mergeXPostData,
  parseFxTwitterResponse,
  parseVxTwitterResponse,
  renderXArticleToMarkdown,
  type ParsedXPost,
} from "@/core/x-post-core";

function buildPost(overrides: Partial<ParsedXPost> = {}): ParsedXPost {
  return {
    id: "100",
    text: "hello",
    mediaUrls: [],
    videoUrls: [],
    ...overrides,
  };
}

describe("x-post-core", () => {
  describe("extractXPostId", () => {
    it("extracts post id from x.com and twitter.com status urls", () => {
      expect(extractXPostId("https://x.com/user/status/123456")).toBe("123456");
      expect(extractXPostId("https://twitter.com/user/status/987654")).toBe("987654");
      expect(extractXPostId("https://mobile.x.com/user/status/111")).toBe("111");
    });

    it("returns null for non-status or invalid urls", () => {
      expect(extractXPostId("https://x.com/user")).toBeNull();
      expect(extractXPostId("https://example.com/status/1")).toBeNull();
      expect(extractXPostId("")).toBeNull();
    });

    it("falls back to regex for malformed urls", () => {
      expect(extractXPostId("x.com/user/status/42 trailing text")).toBe("42");
    });
  });

  describe("isXPostUrl", () => {
    it("detects x post urls", () => {
      expect(isXPostUrl("https://x.com/a/status/1")).toBe(true);
      expect(isXPostUrl("https://twitter.com/a/status/2")).toBe(true);
      expect(isXPostUrl("https://example.com")).toBe(false);
    });
  });

  describe("extractXFirstParagraphTitle", () => {
    it("strips trailing t.co links and takes the first paragraph", () => {
      const title = extractXFirstParagraphTitle("第一段内容\n第二段内容 https://t.co/abc123");
      expect(title).toBe("第一段内容");
    });

    it("strips a leading url and mention", () => {
      expect(extractXFirstParagraphTitle("https://x.com/a/status/1 @user 今天天气不错")).toBe("今天天气不错");
    });

    it("falls back to sanitized url host for empty text", () => {
      expect(extractXFirstParagraphTitle("", "https://x.com/user/status/1")).toBe("x-com");
    });
  });

  describe("parseVxTwitterResponse", () => {
    it("parses text, author and appends name=orig to pbs media", () => {
      const post = parseVxTwitterResponse({
        tweetID: "777",
        text: "正文",
        user_name: "张三",
        user_screen_name: "zhangsan",
        mediaURLs: ["https://pbs.twimg.com/media/abc"],
      });
      expect(post?.id).toBe("777");
      expect(post?.authorName).toBe("张三");
      expect(post?.mediaUrls).toEqual(["https://pbs.twimg.com/media/abc?name=orig"]);
    });

    it("collects videos from media_extended and quote info from qrt", () => {
      const post = parseVxTwitterResponse({
        tweetID: "1",
        text: "t",
        media_extended: [{ type: "video", url: "https://video.twimg.com/x.mp4" }],
        qrt: { user_screen_name: "q", text: "引用", mediaURLs: ["https://pbs.twimg.com/media/q1?name=orig"] },
      });
      expect(post?.videoUrls).toEqual(["https://video.twimg.com/x.mp4"]);
      expect(post?.quoteInfo?.author).toBe("q");
      expect(post?.quoteInfo?.mediaUrls).toEqual(["https://pbs.twimg.com/media/q1?name=orig"]);
    });

    it("returns null for invalid payload", () => {
      expect(parseVxTwitterResponse(null)).toBeNull();
      expect(parseVxTwitterResponse("text")).toBeNull();
    });
  });

  describe("parseFxTwitterResponse", () => {
    it("parses photos and videos from tweet media", () => {
      const post = parseFxTwitterResponse({
        code: 200,
        tweet: {
          id: "5",
          text: "fx text",
          author: { name: "李四", screen_name: "lisi" },
          media: {
            photos: [{ url: "https://pbs.twimg.com/media/p1?format=jpg" }],
            all: [{ type: "video", url: "https://video.twimg.com/v1.mp4" }],
          },
        },
      });
      expect(post?.mediaUrls).toEqual(["https://pbs.twimg.com/media/p1?format=jpg"]);
      expect(post?.videoUrls).toEqual(["https://video.twimg.com/v1.mp4"]);
      expect(post?.authorScreenName).toBe("lisi");
    });

    it("rejects non-200 payloads", () => {
      expect(parseFxTwitterResponse({ code: 404 })).toBeNull();
      expect(parseFxTwitterResponse({})).toBeNull();
    });
  });

  describe("mergeXPostData", () => {
    it("prefers the longer text and keeps the article with blocks", () => {
      const vx = buildPost({ id: "vx", text: "vx short", article: { title: "vxa" } });
      const fx = buildPost({
        id: "fx",
        text: "fx much longer text",
        article: { title: "fxa", content: { blocks: [{ text: "b" }] } },
      });
      const merged = mergeXPostData(vx, fx);
      expect(merged?.text).toBe("fx much longer text");
      expect(merged?.article?.title).toBe("fxa");
    });

    it("dedupes media by base url keeping name=orig variants", () => {
      const vx = buildPost({ mediaUrls: ["https://pbs.twimg.com/media/a?name=orig"] });
      const fx = buildPost({ mediaUrls: ["https://pbs.twimg.com/media/a"] });
      expect(mergeXPostData(vx, fx)?.mediaUrls).toEqual(["https://pbs.twimg.com/media/a?name=orig"]);
    });

    it("returns the only post when one side is null", () => {
      expect(mergeXPostData(null, buildPost({ id: "fx" }))?.id).toBe("fx");
      expect(mergeXPostData(buildPost({ id: "vx" }), null)?.id).toBe("vx");
      expect(mergeXPostData(null, null)).toBeNull();
    });
  });

  describe("renderXArticleToMarkdown", () => {
    it("renders headers, cover image and intro quote", () => {
      const md = renderXArticleToMarkdown(
        {
          title: "文章标题",
          cover_media: { media_info: { original_img_url: "https://img.example/cover.jpg" } },
          content: {
            blocks: [
              { type: "header-one", text: "一级标题" },
              { type: "unordered-list-item", text: "列表项" },
            ],
          },
        },
        "推文导语"
      );
      expect(md).toContain("![封面图片](https://img.example/cover.jpg)");
      expect(md).toContain("> 推文导语");
      expect(md).toContain("# 一级标题");
      expect(md).toContain("- 列表项");
    });

    it("renders atomic media entities and markdown blocks", () => {
      const md = renderXArticleToMarkdown({
        content: {
          blocks: [{ type: "atomic", entityRanges: [{ key: 0, offset: 0, length: 1 }] }],
          entityMap: {
            0: { type: "MEDIA", data: { mediaItems: [{ mediaId: "m1" }] } },
          },
        },
        media_entities: [{ media_id: "m1", media_info: { original_img_url: "https://img.example/a.jpg" } }],
      });
      expect(md).toContain("![图片](https://img.example/a.jpg)");
    });

    it("rewrites inline link entities without breaking offset order", () => {
      const md = renderXArticleToMarkdown({
        content: {
          blocks: [
            {
              type: "unstyled",
              text: "前缀 链接文字 后缀",
              entityRanges: [{ key: "l1", offset: 3, length: 4 }],
            },
          ],
          entityMap: { l1: { type: "LINK", data: { url: "https://example.com" } } },
        },
      });
      expect(md).toContain("前缀 [链接文字](https://example.com) 后缀");
    });
  });

  describe("formatXPostMarkdown", () => {
    it("joins paragraphs, media and video links", () => {
      const md = formatXPostMarkdown("第一段\n第二段 https://t.co/x1", ["https://img.example/1.jpg"], undefined, [
        "https://video.example/1.mp4",
      ]);
      expect(md).toContain("第一段\n\n第二段");
      expect(md).toContain("![图片](https://img.example/1.jpg)");
      expect(md).toContain("[视频链接](https://video.example/1.mp4)");
    });

    it("renders quoted tweet as blockquote with images", () => {
      const md = formatXPostMarkdown("正文", [], {
        author: "quoted",
        text: "引用内容 https://t.co/y1",
        mediaUrls: ["https://img.example/q.jpg"],
      });
      expect(md).toContain("**引用 @quoted：**");
      expect(md).toContain("> 引用内容");
      expect(md).toContain("> ![引用图片](https://img.example/q.jpg)");
    });
  });
});
