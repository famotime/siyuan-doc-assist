export const DEFAULT_MONTHLY_DIARY_TEMPLATE = `## {{date}} {{weekday}} 晴

**健康**

- [ ] 15分钟冥想：
- [ ] 零点前睡觉
- 0步，0俯卧撑，0单杆，0深蹲

**生活**

- 阅读：

- 写作：

- 今日话题（每日一问）：
  - …
  - …
  - …

**工作/学习**

- …

**财务**

- …

**感想/反思**

- …

**开心/感恩之事**

- …`;

type MonthlyDiaryTemplateVariables = {
  date: string;
  weekday: string;
};

type BuildMonthlyDiaryMarkdownOptions = {
  template?: string;
  now?: Date;
};

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function normalizeMonthlyDiaryTemplate(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_MONTHLY_DIARY_TEMPLATE;
  }
  return value.trim() ? value : DEFAULT_MONTHLY_DIARY_TEMPLATE;
}

export function renderMonthlyDiaryTemplate(
  template: string,
  variables: MonthlyDiaryTemplateVariables
): string {
  const normalizedTemplate = normalizeMonthlyDiaryTemplate(template);
  return normalizedTemplate
    .replace(/\{\{\s*date\s*\}\}/gu, variables.date)
    .replace(/\{\{\s*weekday\s*\}\}/gu, variables.weekday);
}

export function buildMonthlyDiaryMarkdown(
  options: BuildMonthlyDiaryMarkdownOptions = {}
): string {
  const now = options.now || new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const dayCount = getMonthlyDiaryDayCount(now);
  const template = normalizeMonthlyDiaryTemplate(options.template);
  const sections: string[] = [];

  for (let day = 1; day <= dayCount; day += 1) {
    const current = new Date(year, monthIndex, day);
    sections.push(
      renderMonthlyDiaryTemplate(template, {
        date: formatIsoDate(current),
        weekday: WEEKDAY_LABELS[current.getDay()] || "",
      }).trim()
    );
  }

  return sections.join("\n\n");
}

export function buildMonthlyDiaryTitle(now = new Date()): string {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm} 月记`;
}

export function getMonthlyDiaryDayCount(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function formatIsoDate(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
