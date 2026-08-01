import { describe, expect, test } from "vitest";
import { buildMergeSelectedListBlocksPreview } from "@/core/list-block-merge-core";

describe("list-block-merge-core", () => {
  test("converts paragraphs and keeps existing list indentation hierarchy, matching the first block type", () => {
    const previewUnordered = buildMergeSelectedListBlocksPreview([
      { id: "a", type: "p", markdown: "第一段" },
      { id: "b", type: "i", markdown: "- 第二项" },
      { id: "c", type: "l", markdown: "- 第三项\n  1. 第四项\n    第四项说明" },
    ]);

    expect(previewUnordered.supportedBlockCount).toBe(3);
    expect(previewUnordered.paragraphBlockCount).toBe(1);
    expect(previewUnordered.resultItemCount).toBe(4);
    expect(previewUnordered.updateBlockId).toBe("a");
    expect(previewUnordered.deleteBlockIds).toEqual(["b", "c"]);
    expect(previewUnordered.mergedMarkdown).toBe(
      "- 第一段\n- 第二项\n- 第三项\n  1. 第四项\n    第四项说明"
    );

    const previewOrdered = buildMergeSelectedListBlocksPreview([
      { id: "a", type: "p", markdown: "第一段" },
      { id: "b", type: "i", markdown: "1. 第二项" },
      { id: "c", type: "l", markdown: "- 第三项\n  1. 第四项\n    第四项说明" },
    ]);

    expect(previewOrdered.mergedMarkdown).toBe(
      "1. 第一段\n2. 第二项\n3. 第三项\n  1. 第四项\n    第四项说明"
    );
  });

  test("keeps multi-line paragraph body as one list item continuation", () => {
    const preview = buildMergeSelectedListBlocksPreview([
      { id: "a", type: "NodeParagraph", markdown: "第一行\n第二行" },
    ]);

    expect(preview.resultItemCount).toBe(1);
    expect(preview.mergedMarkdown).toBe("- 第一行\n  第二行");
  });

  test("preserves nested list indentation from existing list blocks", () => {
    const preview = buildMergeSelectedListBlocksPreview([
      {
        id: "a",
        type: "NodeList",
        markdown: "- 父项\n  - 子项\n    子项说明\n- 末项",
      },
    ]);

    expect(preview.resultItemCount).toBe(3);
    expect(preview.mergedMarkdown).toBe("- 父项\n  - 子项\n    子项说明\n- 末项");
  });

  test("filters out lines containing only bullet points like •", () => {
    const preview = buildMergeSelectedListBlocksPreview([
      { id: "a", type: "p", markdown: "•" },
      { id: "b", type: "p", markdown: "文章配图、知识解释图、概念拆解图" },
      { id: "c", type: "p", markdown: "  •  " },
      { id: "d", type: "p", markdown: "工作汇报配图、项目状态图" },
      { id: "e", type: "p", markdown: "•\n产品机制图、系统架构图\n•" },
    ]);

    expect(preview.resultItemCount).toBe(3);
    expect(preview.mergedMarkdown).toBe(
      "- 文章配图、知识解释图、概念拆解图\n- 工作汇报配图、项目状态图\n- 产品机制图、系统架构图"
    );
  });
});

