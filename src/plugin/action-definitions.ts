import { DockDocActionGroup } from "@/core/dock-panel-core";

export type ActionKey =
  | "export-current"
  | "export-child-docs-zip"
  | "export-related-docs-zip"
  | "insert-backlinks"
  | "insert-child-docs"
  | "create-monthly-diary"
  | "export-child-key-info-zip"
  | "export-backlinks-zip"
  | "export-forward-zip"
  | "move-backlinks"
  | "move-forward-links"
  | "create-open-docs-summary"
  | "create-top100-large-documents-report"
  | "dedupe"
  | "remove-extra-blank-lines"
  | "trim-trailing-whitespace"
  | "convert-images-to-webp"
  | "convert-images-to-png"
  | "resize-images-to-display"
  | "remove-doc-images"
  | "toggle-links-refs"
  | "insert-doc-summary"
  | "create-doc-concept-map"
  | "mark-irrelevant-paragraphs"
  | "mark-key-content"
  | "clean-ai-output"
  | "clean-clipped-list-prefixes"
  | "mark-invalid-links-refs"
  | "insert-blank-before-headings"
  | "toggle-heading-bold"
  | "merge-selected-list-blocks"
  | "delete-from-current-to-end"
  | "delete-from-start-to-current"
  | "remove-strikethrough-marked-content"
  | "bold-selected-blocks"
  | "highlight-selected-blocks"
  | "toggle-linebreaks-paragraphs"
  | "remove-selected-spacing"
  | "toggle-selected-punctuation"
  | "split-doc-by-headings"
  | "recognize-doc-images"
  | "set-selection-as-title"
  | "extract-web-links"
  | "export-keymap"
  | "import-keymap";

export type ActionConfig = {
  key: ActionKey;
  commandText: string;
  menuText: string;
  tooltip?: string;
  group: DockDocActionGroup;
  desktopOnly?: boolean;
  requiresWritableDoc?: boolean;
  noDocRequired?: boolean;
  runInBackground?: boolean;
  icon: string;
  dockIconText: string;
};

export type BaseActionConfig = Omit<ActionConfig, "dockIconText">;

type ActionDefinitionGroup = {
  group: DockDocActionGroup;
  actions: BaseActionConfig[];
};

function createActionTooltip(commandText: string, detail: string): string {
  return `${commandText}\n${detail}`;
}

export function formatActionTooltip(
  tooltip: string | undefined,
  fallbackLabel: string,
  unavailableReason?: string
): string {
  const base = (tooltip || "").trim() || fallbackLabel;
  if (!unavailableReason) {
    return base;
  }
  return `${base}\n\n当前不可用：${unavailableReason}`;
}

export const ACTION_DOCK_ICON_TEXT: Record<ActionKey, string> = {
  "export-current": "导",
  "export-child-docs-zip": "子",
  "export-related-docs-zip": "关",
  "export-child-key-info-zip": "键",
  "export-backlinks-zip": "反",
  "export-forward-zip": "正",
  "move-backlinks": "移",
  "move-forward-links": "正",
  "create-open-docs-summary": "汇",
  "create-top100-large-documents-report": "大",
  dedupe: "重",
  "insert-backlinks": "反",
  "insert-child-docs": "子",
  "create-monthly-diary": "月",
  "insert-blank-before-headings": "空",
  "toggle-heading-bold": "题",
  "merge-selected-list-blocks": "列",
  "mark-invalid-links-refs": "标",
  "convert-images-to-webp": "图",
  "convert-images-to-png": "图",
  "resize-images-to-display": "缩",
  "remove-doc-images": "删",
  "remove-strikethrough-marked-content": "预",
  "bold-selected-blocks": "粗",
  "highlight-selected-blocks": "亮",
  "toggle-linebreaks-paragraphs": "段",
  "remove-selected-spacing": "格",
  "toggle-selected-punctuation": "标",
  "insert-doc-summary": "摘",
  "create-doc-concept-map": "概",
  "mark-irrelevant-paragraphs": "筛",
  "mark-key-content": "关",
  "remove-extra-blank-lines": "空",
  "clean-ai-output": "净",
  "clean-clipped-list-prefixes": "序",
  "trim-trailing-whitespace": "尾",
  "toggle-links-refs": "转",
  "delete-from-current-to-end": "删",
  "delete-from-start-to-current": "删",
  "split-doc-by-headings": "拆",
  "recognize-doc-images": "识",
  "set-selection-as-title": "题",
  "extract-web-links": "链",
  "export-keymap": "出",
  "import-keymap": "入",
};

export const ACTION_DEFINITIONS_BY_GROUP: ActionDefinitionGroup[] = [
  {
    group: "export",
    actions: [
      {
        key: "export-current",
        commandText: "仅导出当前文档",
        menuText: "仅导出当前文档",
        tooltip: createActionTooltip(
          "仅导出当前文档",
          "只导出当前文档本身，不额外带上反链、正链或子文档；若文档含本地媒体，会按思源导出结果一并打包。"
        ),
        group: "export",
        icon: "iconDownload",
      },
      {
        key: "export-child-docs-zip",
        commandText: "打包导出子文档",
        menuText: "打包导出子文档",
        tooltip: createActionTooltip(
          "打包导出子文档",
          "将当前文档与全部子文档打包为 Markdown 压缩包，适合按目录整体导出。"
        ),
        group: "export",
        icon: "iconDownload",
      },
      {
        key: "export-related-docs-zip",
        commandText: "打包导出关联文档",
        menuText: "打包导出关联文档",
        tooltip: createActionTooltip(
          "打包导出关联文档",
          "把当前文档、正链文档、反链文档和子文档去重后一起打包导出。"
        ),
        group: "export",
        icon: "iconDownload",
      },
      {
        key: "export-backlinks-zip",
        commandText: "打包导出反链文档",
        menuText: "打包导出反链文档",
        tooltip: createActionTooltip(
          "打包导出反链文档",
          "把当前文档及其反向链接文档打包导出，便于汇出引用当前主题的资料。"
        ),
        group: "export",
        icon: "iconDownload",
      },
      {
        key: "export-forward-zip",
        commandText: "打包导出正链文档",
        menuText: "打包导出正链文档",
        tooltip: createActionTooltip(
          "打包导出正链文档",
          "把当前文档及正文中直接链接到的文档打包导出。"
        ),
        group: "export",
        icon: "iconDownload",
      },
      {
        key: "export-child-key-info-zip",
        commandText: "打包导出子文档关键内容",
        menuText: "打包导出子文档关键内容",
        tooltip: createActionTooltip(
          "打包导出子文档关键内容",
          "导出当前文档及子文档中已标记的关键内容，并按当前侧栏筛选结果生成压缩包。"
        ),
        group: "export",
        icon: "iconDownload",
      },
      {
        key: "extract-web-links",
        commandText: "提取本文档链接",
        menuText: "提取本文档链接",
        tooltip: createActionTooltip(
          "提取本文档链接",
          "提取当前文档中的所有 Web 链接（URL），一行一个，复制到剪贴板。"
        ),
        group: "export",
        icon: "iconLink",
      },
      {
        key: "export-keymap",
        commandText: "导出快捷键配置",
        menuText: "导出快捷键配置",
        tooltip: createActionTooltip(
          "导出快捷键配置",
          "将当前实例的快捷键配置导出为 JSON 文件，可用于在不同实例之间共享。"
        ),
        group: "export",
        noDocRequired: true,
        icon: "iconUpload",
      },
      {
        key: "import-keymap",
        commandText: "导入快捷键配置",
        menuText: "导入快捷键配置",
        tooltip: createActionTooltip(
          "导入快捷键配置",
          "从 JSON 文件导入快捷键配置，仅覆盖当前实例已有的命令快捷键，不会引入不存在的条目。"
        ),
        group: "export",
        noDocRequired: true,
        icon: "iconDownload",
      },
    ],
  },
  {
    group: "organize",
    actions: [
      {
        key: "move-backlinks",
        commandText: "移动反链文档为子文档",
        menuText: "移动反链文档为子文档",
        tooltip: createActionTooltip(
          "移动反链文档为子文档",
          "将反链文档尝试移动到当前文档下作为子文档；会跳过已在当前层级内或不适合移动的文档。"
        ),
        group: "organize",
        desktopOnly: true,
        requiresWritableDoc: true,
        icon: "iconMove",
      },
      {
        key: "move-forward-links",
        commandText: "移动正链文档为子文档",
        menuText: "移动正链文档为子文档",
        tooltip: createActionTooltip(
          "移动正链文档为子文档",
          "将正链文档尝试移动到当前文档下作为子文档，适合把分散资料归拢到主题文档下。"
        ),
        group: "organize",
        desktopOnly: true,
        requiresWritableDoc: true,
        icon: "iconMove",
      },
      {
        key: "create-open-docs-summary",
        commandText: "生成已打开文档的汇总页",
        menuText: "生成已打开文档的汇总页",
        tooltip: createActionTooltip(
          "生成已打开文档的汇总页",
          "汇总当前已打开且未钉住的文档，生成一篇新的汇总页并自动打开。"
        ),
        group: "organize",
        icon: "iconList",
      },
      {
        key: "create-top100-large-documents-report",
        commandText: "输出Top100大文件清单",
        menuText: "输出Top100大文件清单",
        tooltip: createActionTooltip(
          "输出Top100大文件清单",
          "统计当前笔记本内文档本体与内嵌资源总大小最大的前 100 篇文档，并在 Daily Note 父目录下生成报告文档。"
        ),
        group: "organize",
        icon: "iconList",
      },
      {
        key: "dedupe",
        commandText: "识别本层级重复文档",
        menuText: "识别本层级重复文档",
        tooltip: createActionTooltip(
          "识别本层级重复文档",
          "识别当前层级下标题和内容相近的重复文档候选，可继续打开对比、插入链接或删除。"
        ),
        group: "organize",
        desktopOnly: true,
        icon: "iconTrashcan",
      },
      {
        key: "split-doc-by-headings",
        commandText: "按标题拆分文档",
        menuText: "按标题拆分文档",
        tooltip: createActionTooltip(
          "按标题拆分文档",
          "将文档按最高级标题拆分为多个子文档；第一个标题前的内容保留在原文档，拆分后原文档中的已拆分内容将被删除。"
        ),
        group: "organize",
        requiresWritableDoc: true,
        icon: "iconSplitLR",
      },
    ],
  },
  {
    group: "insert",
    actions: [
      {
        key: "insert-backlinks",
        commandText: "插入反链文档列表（去重）",
        menuText: "插入反链文档列表（去重）",
        tooltip: createActionTooltip(
          "插入反链文档列表（去重）",
          "把正文中尚未出现的反链文档链接追加到当前文档末尾，避免重复插入。"
        ),
        group: "insert",
        requiresWritableDoc: true,
        icon: "iconList",
      },
      {
        key: "insert-child-docs",
        commandText: "插入子文档列表（去重）",
        menuText: "插入子文档列表（去重）",
        tooltip: createActionTooltip(
          "插入子文档列表（去重）",
          "把正文中尚未出现的子文档链接追加到当前文档末尾，适合增量整理目录。"
        ),
        group: "insert",
        requiresWritableDoc: true,
        icon: "iconList",
      },
      {
        key: "create-monthly-diary",
        commandText: "新建本月日记",
        menuText: "新建本月日记",
        tooltip: createActionTooltip(
          "新建本月日记",
          "按当前笔记本的 Daily Note 保存目录创建一篇本月月记，并按设置中的 Markdown 模板自动展开本月每天的小节。"
        ),
        group: "insert",
        icon: "iconList",
      },
      {
        key: "toggle-links-refs",
        commandText: "链接<->引用批量互转",
        menuText: "链接<->引用批量互转",
        tooltip: createActionTooltip(
          "链接<->引用批量互转",
          "自动判断当前文档以链接还是引用为主，并批量执行“链接转引用”或“引用转链接”。"
        ),
        group: "insert",
        requiresWritableDoc: true,
        icon: "iconLink",
      },
      {
        key: "mark-invalid-links-refs",
        commandText: "标示无效链接/引用",
        menuText: "标示无效链接/引用",
        tooltip: createActionTooltip(
          "标示无效链接/引用",
          "检查当前文档里的思源链接和引用；无效项会加上删除线和高亮，便于后续人工清理。"
        ),
        group: "insert",
        requiresWritableDoc: true,
        icon: "iconLink",
      },
      {
        key: "insert-blank-before-headings",
        commandText: "标题前增加空段落",
        menuText: "标题前增加空段落",
        tooltip: createActionTooltip(
          "标题前增加空段落",
          "为缺少空段落的标题前补一个空段落，让段落层次更清晰。"
        ),
        group: "insert",
        requiresWritableDoc: true,
        icon: "iconList",
      },
      {
        key: "set-selection-as-title",
        commandText: "选中内容作为标题",
        menuText: "选中内容作为标题",
        tooltip: createActionTooltip(
          "选中内容作为标题",
          "将选中的文字设为当前文档标题；若未选中任何内容，则将光标所在行（以换行符为分隔）的文字作为文档标题。"
        ),
        group: "insert",
        requiresWritableDoc: true,
        icon: "iconEdit",
      },
    ],
  },
  {
    group: "ai",
    actions: [
      {
        key: "create-doc-concept-map",
        commandText: "生成概念地图",
        menuText: "生成概念地图",
        tooltip: createActionTooltip(
          "生成概念地图",
          "读取当前文档正文生成概念地图子文档，输出为层次化列表项和说明，并自动打开新文档。"
        ),
        group: "ai",
        requiresWritableDoc: true,
        runInBackground: true,
        icon: "iconList",
      },
      {
        key: "insert-doc-summary",
        commandText: "插入文档摘要",
        menuText: "插入文档摘要",
        tooltip: createActionTooltip(
          "插入文档摘要",
          "读取当前文档正文生成 AI 摘要，并插入到正文开头附近；已有导语链接时会避开首段。"
        ),
        group: "ai",
        requiresWritableDoc: true,
        icon: "iconList",
      },
      {
        key: "mark-irrelevant-paragraphs",
        commandText: "标记口水内容",
        menuText: "标记口水内容",
        tooltip: createActionTooltip(
          "标记口水内容",
          "用 AI 识别正文中的口水段落，并为整段加删除线；默认跳过文首分隔线前内容和已全段删除线内容。"
        ),
        group: "ai",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
      {
        key: "mark-key-content",
        commandText: "标记关键内容",
        menuText: "标记关键内容",
        tooltip: createActionTooltip(
          "标记关键内容",
          "用 AI 识别正文中的关键句并在原段落内局部加粗；默认跳过文首分隔线前内容。"
        ),
        group: "ai",
        requiresWritableDoc: true,
        icon: "iconBold",
      },
      {
        key: "recognize-doc-images",
        commandText: "本文档图片文字识别",
        menuText: "本文档图片文字识别",
        tooltip: createActionTooltip(
          "本文档图片文字识别",
          "将本文档所有图片逐个发送给 AI 视觉服务，识别成文字后以引用格式插入到对应图片下方。"
        ),
        group: "ai",
        requiresWritableDoc: true,
        runInBackground: true,
        icon: "iconImage",
      },
      {
        key: "clean-ai-output",
        commandText: "清理AI输出内容",
        menuText: "清理AI输出内容",
        tooltip: createActionTooltip(
          "清理AI输出内容",
          "清理常见 AI 报告残留，如脚注上标、^^ 标记、隐藏引用 span、引用标记和”互联网”来源链接；目前主要适配 Deep Research 类输出。"
        ),
        group: "ai",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
    ],
  },
  {
    group: "edit",
    actions: [
      {
        key: "toggle-heading-bold",
        commandText: "标题块加粗状态切换",
        menuText: "标题块加粗状态切换",
        tooltip: createActionTooltip(
          "标题块加粗状态切换",
          "统一切换当前文档所有标题块的加粗状态：只要存在已加粗标题，就会批量取消；否则批量加粗。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconBold",
      },
      {
        key: "merge-selected-list-blocks",
        commandText: "选中内容合并列表块",
        menuText: "选中内容合并列表块",
        tooltip: createActionTooltip(
          "选中内容合并列表块",
          "把选中的段落、列表或列表项合并为一个列表块；普通段落会转成列表项，并删除其余已合并块。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconList",
      },
      {
        key: "bold-selected-blocks",
        commandText: "选中块全部加粗",
        menuText: "选中块全部加粗",
        tooltip: createActionTooltip(
          "选中块全部加粗",
          "为当前选中的多个块统一处理加粗：混合选中时仅补齐未加粗块；若全部已加粗，再次执行则统一取消。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconBold",
      },
      {
        key: "highlight-selected-blocks",
        commandText: "选中块全部高亮",
        menuText: "选中块全部高亮",
        tooltip: createActionTooltip(
          "选中块全部高亮",
          "为当前选中的多个块统一处理高亮：混合选中时仅补齐未高亮块；若全部已高亮，再次执行则统一取消。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconInfo",
      },
      {
        key: "toggle-linebreaks-paragraphs",
        commandText: "选中内容换行-分段互转",
        menuText: "选中内容换行-分段互转",
        tooltip: createActionTooltip(
          "选中内容换行-分段互转",
          "选中多个段落时可合并为一个块；选中含单个换行的段落时可把换行拆成分段。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconRefresh",
      },
      {
        key: "toggle-selected-punctuation",
        commandText: "选中内容中英文标点互转",
        menuText: "选中内容中英文标点互转",
        tooltip: createActionTooltip(
          "选中内容中英文标点互转",
          "对选中内容批量中英文标点互转；默认先英转中，再次执行会按当前内容反向转换。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconRefresh",
      },
      {
        key: "remove-selected-spacing",
        commandText: "选中内容删除空格",
        menuText: "选中内容删除空格",
        tooltip: createActionTooltip(
          "选中内容删除空格",
          "删除选中内容中的空格、Tab、零宽字符等空白字符；支持局部选区或多块批量处理。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
      {
        key: "trim-trailing-whitespace",
        commandText: "清理行尾空格（含Tab）",
        menuText: "清理行尾空格（含Tab）",
        tooltip: createActionTooltip(
          "清理行尾空格（含Tab）",
          "清理当前文档所有段落末尾的空格和 Tab，仅处理行尾多余空白。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
      {
        key: "clean-clipped-list-prefixes",
        commandText: "清理剪藏内容",
        menuText: "清理剪藏内容",
        tooltip: createActionTooltip(
          "清理剪藏内容",
          "清理网页剪藏后的列表噪音：合并断开的列表项、去掉重复前缀，并按需要拆分中英双语段落。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
      {
        key: "remove-extra-blank-lines",
        commandText: "去除本文档空段落",
        menuText: "去除本文档空段落",
        tooltip: createActionTooltip(
          "去除本文档空段落",
          "删除当前文档中的空段落，让正文更紧凑。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
      {
        key: "delete-from-current-to-end",
        commandText: "删除后续段落（含本段）",
        menuText: "删除后续段落（含本段）",
        tooltip: createActionTooltip(
          "删除后续段落（含本段）",
          "从当前光标所在段开始，批量删除后续所有同级正文块；适合清理文章尾部冗余内容。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
      {
        key: "delete-from-start-to-current",
        commandText: "删除之前段落（含本段）",
        menuText: "删除之前段落（含本段）",
        tooltip: createActionTooltip(
          "删除之前段落（含本段）",
          "从文档开头到当前光标所在段，批量删除所有同级正文块。文首前10个段落中的分隔线（---）及之前的内容（文档概要）将被保留。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
      {
        key: "remove-strikethrough-marked-content",
        commandText: "清理预删除内容",
        menuText: "清理预删除内容",
        tooltip: createActionTooltip(
          "清理预删除内容",
          "删除整篇文档中被删除线标记的内容，适合配合“标记口水内容”或手工预删除流程做最终清理。"
        ),
        group: "edit",
        requiresWritableDoc: true,
        icon: "iconTrashcan",
      },
    ],
  },
  {
    group: "image",
    actions: [
      {
        key: "convert-images-to-webp",
        commandText: "批量转换为WebP",
        menuText: "批量转换为WebP",
        tooltip: createActionTooltip(
          "批量转换为WebP",
          "将当前文档里的本地图片批量转为 WebP 并回写链接；已是 WebP、GIF 或收益不足的图片会跳过。"
        ),
        group: "image",
        requiresWritableDoc: true,
        runInBackground: true,
        icon: "iconImage",
      },
      {
        key: "convert-images-to-png",
        commandText: "批量转换为PNG",
        menuText: "批量转换为PNG",
        tooltip: createActionTooltip(
          "批量转换为PNG",
          "将当前文档里的本地图片批量转为 PNG 并回写链接；GIF 会自动跳过。"
        ),
        group: "image",
        requiresWritableDoc: true,
        icon: "iconImage",
      },
      {
        key: "resize-images-to-display",
        commandText: "按当前显示调整图片尺寸",
        menuText: "按当前显示调整图片尺寸",
        tooltip: createActionTooltip(
          "按当前显示调整图片尺寸",
          "按文档中的当前显示宽度重采样本地图片并回写链接，用于压缩图片体积。"
        ),
        group: "image",
        requiresWritableDoc: true,
        icon: "iconImage",
      },
      {
        key: "remove-doc-images",
        commandText: "删除本文档图片",
        menuText: "删除本文档图片",
        tooltip: createActionTooltip(
          "删除本文档图片",
          "删除当前文档中的图片链接和图片块，用于提取纯文本内容。"
        ),
        group: "image",
        requiresWritableDoc: true,
        icon: "iconImage",
      },
    ],
  },
];

export const BASE_ACTIONS: BaseActionConfig[] = ACTION_DEFINITIONS_BY_GROUP.flatMap((entry) => entry.actions);
