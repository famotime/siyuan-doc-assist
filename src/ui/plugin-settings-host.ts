import { applySettingTooltip } from "@/ui/plugin-settings-shared";

type SettingLike = {
  open: (name: string) => void;
};

export type SettingHostPanelConfig = {
  element: HTMLElement | null;
  tooltip?: string;
};

export function normalizeSettingPanelHost(
  panel: HTMLElement | null,
  tooltip?: string
): void {
  if (!panel) {
    return;
  }

  const parent = panel.parentElement;
  const itemWrap = panel.closest(".config-item, .config__item, .b3-label") || parent;
  const titleWrap =
    itemWrap?.querySelector(":scope > .fn__flex-1, :scope > .fn__block, :scope .config-name, :scope .fn__flex-1") ||
    itemWrap?.querySelector(".config-name, .fn__flex-1");
  const spacer = itemWrap?.querySelector(".fn__space");

  panel.classList.remove("fn__flex-center", "fn__size200");
  panel.style.width = "100%";
  panel.style.height = "auto";
  panel.style.minHeight = "0";
  panel.style.flex = "none";
  panel.style.alignSelf = "stretch";

  if (itemWrap instanceof HTMLElement) {
    itemWrap.classList.add("doc-assistant-settings__host-item");
    itemWrap.style.height = "auto";
    itemWrap.style.minHeight = "0";
    itemWrap.style.alignItems = "stretch";
  }

  if (parent instanceof HTMLElement && parent !== itemWrap) {
    parent.classList.add("doc-assistant-settings__host-block");
    parent.style.width = "100%";
    parent.style.height = "auto";
    parent.style.minHeight = "0";
  }

  if (titleWrap instanceof HTMLElement) {
    titleWrap.classList.add("doc-assistant-settings__host-title");
    titleWrap.style.overflow = "visible";
    titleWrap.style.minHeight = "0";
    applySettingTooltip(titleWrap, tooltip);
  }

  if (spacer instanceof HTMLElement) {
    spacer.classList.add("doc-assistant-settings__host-space");
  }
}

export type SettingHostRowConfig = {
  element: HTMLElement | null;
  tooltip?: string;
};

export function normalizeSettingRowHost(
  control: HTMLElement | null,
  tooltip?: string
): void {
  if (!control) {
    return;
  }

  const itemWrap = control.parentElement;
  const titleWrap = itemWrap?.querySelector(":scope > .fn__flex-1");
  const spacer = itemWrap?.querySelector(":scope > .fn__space");

  control.classList.remove("fn__flex-center", "fn__size200", "fn__block");
  const sw = control.matches(".b3-switch") ? control : control.querySelector(".b3-switch");
  if (sw) {
    sw.classList.remove("fn__flex-center", "fn__size200", "fn__block");
  }

  if (itemWrap instanceof HTMLElement) {
    itemWrap.classList.add(
      "doc-assistant-settings__host-item",
      "doc-assistant-settings__host-row"
    );
    itemWrap.style.height = "auto";
    itemWrap.style.minHeight = "0";
    itemWrap.style.alignItems = "center";
  }

  if (titleWrap instanceof HTMLElement) {
    titleWrap.classList.add("doc-assistant-settings__host-title");
    titleWrap.style.overflow = "visible";
    titleWrap.style.minHeight = "0";
    applySettingTooltip(titleWrap, tooltip);
  }

  if (spacer instanceof HTMLElement) {
    spacer.classList.add("doc-assistant-settings__host-space");
  }
}

export function installSettingHostNormalizer(
  setting: SettingLike,
  panels: Array<SettingHostPanelConfig | HTMLElement | null>,
  rows: Array<SettingHostRowConfig | HTMLElement | null> = []
): void {
  const originalOpen = setting.open.bind(setting);
  const normalizeElements = () => {
    panels.forEach((panel) => {
      if (!panel) {
        return;
      }
      if (panel instanceof HTMLElement) {
        normalizeSettingPanelHost(panel);
      } else {
        normalizeSettingPanelHost(panel.element, panel.tooltip);
      }
    });
    rows.forEach((row) => {
      if (!row) {
        return;
      }
      if (row instanceof HTMLElement) {
        normalizeSettingRowHost(row);
      } else {
        normalizeSettingRowHost(row.element, row.tooltip);
      }
    });
  };

  setting.open = ((name: string) => {
    originalOpen(name);
    normalizeElements();
    setTimeout(() => {
      normalizeElements();
    }, 0);
  }) as typeof setting.open;
}

