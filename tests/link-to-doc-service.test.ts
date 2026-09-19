// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clipWebLinkToDoc,
  clipWebLinksToDocs,
  fetchLinkTitles,
  fetchPageHtml,
} from "@/services/link-to-doc-service";
import { createDocWithMd, forwardProxy, getDocMetaByID } from "@/services/kernel";

vi.mock("@/services/kernel", () => ({
  forwardProxy: vi.fn(),
  getDocMetaByID: vi.fn(),
  createDocWithMd: vi.fn(),
}));

const mockForwardProxy = vi.mocked(forwardProxy);
const mockGetDocMetaByID = vi.mocked(getDocMetaByID);
const mockCreateDocWithMd = vi.mocked(createDocWithMd);

describe("link-to-doc-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchPageHtml", () => {
    it("fetches html successfully through forwardProxy", async () => {
      mockForwardProxy.mockResolvedValueOnce({
        status: 200,
        body: "<html><body><h1>Hello World</h1></body></html>",
      });

      const html = await fetchPageHtml("https://example.com/test");
      expect(html).toContain("Hello World");
      expect(mockForwardProxy).toHaveBeenCalledTimes(1);
    });

    it("follows wechat original link in feishu page", async () => {
      // 第一次返回飞书页面，包含微信链接
      mockForwardProxy.mockResolvedValueOnce({
        status: 200,
        body: "<html><body><div>原文链接：https://mp.weixin.qq.com/s/real_article</div></body></html>",
      });
      // 第二次返回微信文章
      mockForwardProxy.mockResolvedValueOnce({
        status: 200,
        body: "<html><body><h1 id='activity-name'>微信真实文章</h1></body></html>",
      });

      const html = await fetchPageHtml("https://waytoagi.feishu.cn/doc123");
      expect(html).toContain("微信真实文章");
      expect(mockForwardProxy).toHaveBeenCalledTimes(2);
      expect(mockForwardProxy).toHaveBeenNthCalledWith(
        2,
        "https://mp.weixin.qq.com/s/real_article",
        "GET",
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it("throws error when status is error", async () => {
      mockForwardProxy.mockResolvedValueOnce({
        status: 404,
        body: "Not Found",
      });

      await expect(fetchPageHtml("https://example.com/notfound")).rejects.toThrow(
        "获取网页失败，状态码: 404"
      );
    });
  });

  describe("fetchLinkTitles", () => {
    it("fetches titles for multiple links concurrently and handles fallbacks", async () => {
      mockForwardProxy.mockImplementation(async (url) => {
        if (url.includes("success")) {
          return {
            status: 200,
            body: "<html><head><title>成功获取的网页标题</title></head><body>正文</body></html>",
          };
        }
        return { status: 500, body: "" };
      });

      const links = [
        { url: "https://example.com/success", originalUrl: "https://example.com/success" },
        {
          url: "https://example.com/failed",
          originalUrl: "https://example.com/failed",
          fallbackTitle: "我的备选标题",
        },
      ];

      const results = await fetchLinkTitles(links, 2);
      expect(results).toHaveLength(2);

      expect(results[0].title).toBe("成功获取的网页标题");
      expect(results[0].hasFetchedTitle).toBe(true);

      expect(results[1].title).toBe("我的备选标题");
      expect(results[1].hasFetchedTitle).toBe(false);
    });
  });

  describe("clipWebLinkToDoc", () => {
    it("clips single link and creates sibling doc", async () => {
      mockForwardProxy.mockResolvedValueOnce({
        status: 200,
        body: `
          <html>
            <head>
              <meta property="og:title" content="AI大模型进展" />
              <meta name="author" content="研究员小王" />
              <meta property="article:published_time" content="2026-09-01" />
            </head>
            <body>
              <article>
                <p>这是大模型正文介绍，包含重要内容。</p>
              </article>
            </body>
          </html>
        `,
      });

      mockCreateDocWithMd.mockResolvedValueOnce("created-doc-id-1");

      const link = { url: "https://example.com/ai", originalUrl: "https://example.com/ai" };
      const res = await clipWebLinkToDoc("test-box", "/技术/文章汇总", link);

      expect(res.docId).toBe("created-doc-id-1");
      expect(res.title).toBe("AI大模型进展");

      // 验证创建文档的路径为同级兄弟路径: /技术/AI大模型进展
      expect(mockCreateDocWithMd).toHaveBeenCalledWith(
        "test-box",
        "/技术/AI大模型进展",
        expect.stringContaining("**原始链接：** [https://example.com/ai](https://example.com/ai)")
      );
    });
  });

  describe("clipWebLinksToDocs", () => {
    it("processes batch of links and records progress and errors", async () => {
      mockGetDocMetaByID.mockResolvedValueOnce({
        id: "cur-doc",
        box: "box-1",
        hPath: "/工作区/当前任务",
        rootID: "root-1",
      });

      mockForwardProxy.mockImplementation(async (url) => {
        if (url.includes("fail")) {
          return { status: 500, body: "" };
        }
        return {
          status: 200,
          body: "<html><head><title>网页标题</title></head><body>正文</body></html>",
        };
      });

      mockCreateDocWithMd.mockResolvedValue("new-id");

      const progressSpy = vi.fn();
      const links = [
        { url: "https://example.com/1", originalUrl: "https://example.com/1", title: "标题1" },
        { url: "https://example.com/fail", originalUrl: "https://example.com/fail", title: "失败项" },
      ];

      const report = await clipWebLinksToDocs("cur-doc", links, progressSpy);

      expect(report.total).toBe(2);
      expect(report.successCount).toBe(1);
      expect(report.failedCount).toBe(1);
      expect(report.createdDocIds).toEqual(["new-id"]);
      expect(report.errors[0].url).toBe("https://example.com/fail");

      expect(progressSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("X post clipping & title extraction", () => {
    it("clips X post via structured API with first paragraph as title and preserved paragraph breaks", async () => {
      // 模拟 FxTwitter API 返回数据
      mockForwardProxy.mockImplementation(async (url) => {
        if (url.includes("api.fxtwitter.com/status/123456")) {
          return {
            status: 200,
            body: JSON.stringify({
              code: 200,
              tweet: {
                text: "X正文第一段介绍内容。\n\nX正文第二段深入阐述细节。\n第三段总结分析。 https://t.co/xyz123",
                author: {
                  name: "推特作者",
                  screen_name: "twitter_user",
                },
                created_at: "2026-09-19 12:00:00",
                media: {
                  photos: [{ url: "https://pbs.twimg.com/media/test.jpg" }],
                },
              },
            }),
          };
        }
        return { status: 404, body: "" };
      });

      mockCreateDocWithMd.mockResolvedValueOnce("x-doc-id-1");

      const link = {
        url: "https://x.com/twitter_user/status/123456",
        originalUrl: "https://x.com/twitter_user/status/123456",
      };

      const res = await clipWebLinkToDoc("test-box", "/社媒/推特汇总", link);

      expect(res.docId).toBe("x-doc-id-1");
      // 验证标题为正文第一段内容
      expect(res.title).toBe("X正文第一段介绍内容。");

      // 验证创建文档的路径为同级兄弟路径: /社媒/X正文第一段介绍内容。
      expect(mockCreateDocWithMd).toHaveBeenCalledWith(
        "test-box",
        "/社媒/X正文第一段介绍内容。",
        expect.stringContaining("X正文第一段介绍内容。\n\nX正文第二段深入阐述细节。\n\n第三段总结分析。")
      );
    });

    it("prefetches first paragraph title for X post in fetchLinkTitles", async () => {
      mockForwardProxy.mockImplementation(async (url) => {
        if (url.includes("api.fxtwitter.com/status/999")) {
          return {
            status: 200,
            body: JSON.stringify({
              code: 200,
              tweet: {
                text: "首段重要见解与观察！\n\n次段详细说明...",
                author: { name: "Author", screen_name: "author" },
              },
            }),
          };
        }
        return { status: 404, body: "" };
      });

      const links = [
        { url: "https://x.com/author/status/999", originalUrl: "https://x.com/author/status/999" },
      ];

      const titles = await fetchLinkTitles(links, 1);
      expect(titles).toHaveLength(1);
      expect(titles[0].title).toBe("首段重要见解与观察！");
      expect(titles[0].hasFetchedTitle).toBe(true);
    });

    it("clips full long-form Note Tweet by prioritizing complete VxTwitter text over truncated FxTwitter text", async () => {
      mockForwardProxy.mockImplementation(async (url) => {
        if (url.includes("api.vxtwitter.com/status/2096129449725174257")) {
          return {
            status: 200,
            body: JSON.stringify({
              tweetID: "2096129449725174257",
              text: "别再问我 2026 大陆用户还有什么 U 卡值得开了！！！\n\n我整理了目前中国大陆用户最值得开的 6 张卡：\n\n1. Gate U 卡\n\n2. Bybit U 卡\n\n3. PokePay Card\n\n4. Starryblu 星空\n\n5. MEXC New U 卡\n\n6. BiyaPay Virtual Card\n\n如果还有其他对大陆用户友好的卡欢迎评论补充！",
              user_name: "Suu",
              user_screen_name: "Suu766",
              date: "Sat Sep 05 06:52:59 +0000 2026",
              mediaURLs: ["https://pbs.twimg.com/media/HRbyg2paMAA8kz1.jpg"],
            }),
          };
        }
        if (url.includes("api.fxtwitter.com/status/2096129449725174257")) {
          return {
            status: 200,
            body: JSON.stringify({
              code: 200,
              tweet: {
                id: "2096129449725174257",
                // 模拟 FxTwitter 在 180 字符处截断的情形
                text: "别再问我 2026 大陆用户还有什么 U 卡值得开了！！！\n\n我整理了目前中国大陆用户最值得开的 6 张卡：\n\n1. Gate U 卡\n\n2. Bybit U 卡\n\n3. PokePay Card\n约",
                author: { name: "Suu", screen_name: "Suu766" },
                media: { photos: [{ url: "https://pbs.twimg.com/media/HRbyg2paMAA8kz1.jpg?name=orig" }] },
              },
            }),
          };
        }
        return { status: 404, body: "" };
      });

      mockCreateDocWithMd.mockResolvedValueOnce("suu-doc-id");

      const link = {
        url: "https://x.com/Suu766/status/2096129449725174257",
        originalUrl: "https://x.com/Suu766/status/2096129449725174257",
      };

      const res = await clipWebLinkToDoc("test-box", "/卡片/U卡汇总", link);

      expect(res.docId).toBe("suu-doc-id");
      expect(res.title).toBe("别再问我 2026 大陆用户还有什么 U 卡值得开了！！！");

      // 验证生成的正文包含完整的第 4、5、6 项以及结尾评论提示，没有在第 3 项被截断
      expect(mockCreateDocWithMd).toHaveBeenCalledWith(
        "test-box",
        "/卡片/别再问我 2026 大陆用户还有什么 U 卡值得开了！！！",
        expect.stringContaining("4. Starryblu 星空")
      );
      expect(mockCreateDocWithMd).toHaveBeenCalledWith(
        "test-box",
        "/卡片/别再问我 2026 大陆用户还有什么 U 卡值得开了！！！",
        expect.stringContaining("6. BiyaPay Virtual Card")
      );
      expect(mockCreateDocWithMd).toHaveBeenCalledWith(
        "test-box",
        "/卡片/别再问我 2026 大陆用户还有什么 U 卡值得开了！！！",
        expect.stringContaining("如果还有其他对大陆用户友好的卡欢迎评论补充！")
      );
      // 验证媒体图片保留高清链接
      expect(mockCreateDocWithMd).toHaveBeenCalledWith(
        "test-box",
        "/卡片/别再问我 2026 大陆用户还有什么 U 卡值得开了！！！",
        expect.stringContaining("![图片](https://pbs.twimg.com/media/HRbyg2paMAA8kz1.jpg?name=orig)")
      );
    });
  });
});
