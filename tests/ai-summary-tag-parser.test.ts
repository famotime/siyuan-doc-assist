import { describe, expect, test } from "vitest";
import { parseTagsFromAiResponse } from "@/services/ai-summary";

describe("parseTagsFromAiResponse", () => {
  test("parses standard JSON array", () => {
    expect(parseTagsFromAiResponse('["卡车司机", "自由与代价", "阶层固化"]'))
      .toEqual(["卡车司机", "自由与代价", "阶层固化"]);
  });

  test("parses JSON array wrapped in markdown code fence", () => {
    const aiText = "```json\n[\"卡车司机\", \"自由与代价\"]\n```";
    expect(parseTagsFromAiResponse(aiText)).toEqual(["卡车司机", "自由与代价"]);
  });

  test("parses numbered list with explanation colons (e.g. from reasoning models like step-3.7-flash)", () => {
    const aiText = `1. 卡车司机：核心叙事主体
2. 自由与代价
3. 阶层固化与生存挣扎`;
    expect(parseTagsFromAiResponse(aiText)).toEqual([
      "卡车司机",
      "自由与代价",
      "阶层固化与生存挣扎",
    ]);
  });

  test("parses bullet list and symbol-separated text", () => {
    const aiText = `- #职业人生\n- #心理冲突\n- #时代缩影`;
    expect(parseTagsFromAiResponse(aiText)).toEqual(["职业人生", "心理冲突", "时代缩影"]);
  });

  test("parses comma or pause-mark separated text", () => {
    expect(parseTagsFromAiResponse("卡车司机、自由与代价、阶层固化"))
      .toEqual(["卡车司机", "自由与代价", "阶层固化"]);
  });

  test("filters out meta-thinking process sentences and prompt echoes", () => {
    const aiText = `用户现在需要从这篇文档里提取3-5个最准确、简短的主题标签。
1. 卡车司机：核心叙事主体
2. 自由与代价
3. 阶层固化`;
    expect(parseTagsFromAiResponse(aiText)).toEqual([
      "卡车司机",
      "自由与代价",
      "阶层固化",
    ]);
  });
});
