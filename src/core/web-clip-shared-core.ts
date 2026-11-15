/**
 * 网页剪藏共享纯逻辑
 * 供链接核心、X 帖子核心与网页 HTML 核心共用的标题清洗与元数据类型
 */

export type WebArticleMeta = {
  title: string;
  description?: string;
  author?: string;
  publishTime?: string;
  url: string;
};

/**
 * 清洗标题，转换为合法的文档名称/路径（参考参考脚本）
 * 替换文件系统非法字符为全角字符，截断过长标题，防止空标题
 */
export function sanitizeDocTitle(title: string, fallbackUrl?: string): string {
  let clean = (title || "").trim();

  // 字符替换表：替换 Windows/Linux 文件系统敏感字符
  const invalidChars: Record<string, string> = {
    "\\": "＼",
    "/": "／",
    ":": "：",
    "*": "＊",
    "?": "？",
    '"': "＂",
    "<": "＜",
    ">": "＞",
    "|": "｜",
  };

  clean = clean.replace(/[\\/:*?"<>|]/g, (char) => invalidChars[char] || " ");
  // 将连续空格折叠为单空格
  clean = clean.replace(/\s+/g, " ").trim();

  // 若标题为空或太短，使用 URL 域名作为备用标题
  if (!clean || clean.length < 2) {
    if (fallbackUrl) {
      try {
        clean = new URL(fallbackUrl).hostname.replace(/\./g, "-");
      } catch {
        clean = "未命名网页";
      }
    } else {
      clean = "未命名网页";
    }
  }

  // 截断过长标题（最多 80 字符）
  if (clean.length > 80) {
    clean = clean.slice(0, 80).trim();
  }

  return clean;
}
