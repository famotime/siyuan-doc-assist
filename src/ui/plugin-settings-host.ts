type SettingLike = {
  open: (name: string) => void;
};

export function normalizeSettingPanelHost(panel: HTMLElement | null): void {
  if (!panel) {
    return;
  }

  const itemWrap = panel.parentElement;
  const titleWrap = itemWrap?.querySelector(":scope > .fn__flex-1");
  const spacer = itemWrap?.querySelector(":scope > .fn__space");

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
    itemWrap.style.alignItems = "start";
  }

  if (titleWrap instanceof HTMLElement) {
    titleWrap.classList.add("doc-assistant-settings__host-title");
    titleWrap.style.overflow = "visible";
    titleWrap.style.minHeight = "0";
  }

  if (spacer instanceof HTMLElement) {
    spacer.classList.add("doc-assistant-settings__host-space");
  }
}

export function installSettingHostNormalizer(
  setting: SettingLike,
  panels: Array<HTMLElement | null>
): void {
  const originalOpen = setting.open.bind(setting);
  const normalizePanels = () => {
    panels.forEach((panel) => normalizeSettingPanelHost(panel));
  };

  setting.open = ((name: string) => {
    originalOpen(name);
    normalizePanels();
    setTimeout(() => {
      normalizePanels();
    }, 0);
  }) as typeof setting.open;
}
