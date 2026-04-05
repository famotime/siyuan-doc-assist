import { describe, expect, test } from "vitest";
import {
  DEFAULT_MONTHLY_DIARY_TEMPLATE,
  buildMonthlyDiaryMarkdown,
  buildMonthlyDiaryTitle,
  normalizeMonthlyDiaryTemplate,
  renderMonthlyDiaryTemplate,
} from "@/core/monthly-diary-core";

describe("monthly diary core", () => {
  test("renders date and weekday variables in custom markdown template", () => {
    const rendered = renderMonthlyDiaryTemplate("## {{date}} {{weekday}}\n\n- 今日记录", {
      date: "2026-04-05",
      weekday: "周日",
    });

    expect(rendered).toBe("## 2026-04-05 周日\n\n- 今日记录");
  });

  test("builds monthly diary markdown for every day in current month", () => {
    const markdown = buildMonthlyDiaryMarkdown({
      template: "## {{date}} {{weekday}}\n\n- 记录",
      now: new Date("2026-04-05T10:00:00+08:00"),
    });

    expect(markdown).toContain("## 2026-04-01 周三");
    expect(markdown).toContain("## 2026-04-30 周四");
    expect(markdown).not.toContain("2026-04-31");
    expect(markdown.match(/^## /gmu)).toHaveLength(30);
  });

  test("uses default diary template when stored template is blank", () => {
    expect(normalizeMonthlyDiaryTemplate("   ")).toBe(DEFAULT_MONTHLY_DIARY_TEMPLATE);
  });

  test("builds monthly diary title with current year and month", () => {
    expect(buildMonthlyDiaryTitle(new Date("2026-04-05T10:00:00+08:00"))).toBe("2026-04 月记");
  });
});
