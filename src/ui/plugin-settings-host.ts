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

export type SettingHostRowConfig = {
  element: HTMLElement | null;
  fallbackDescription?: string;
};

export function normalizeSettingRowHost(
  control: HTMLElement | null,
  fallbackDescription?: string
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

    let desc = titleWrap.querySelector(".b3-label__text");
    if (!desc && fallbackDescription) {
      desc = document.createElement("div");
      desc.className = "b3-label__text";
      desc.textContent = fallbackDescription;
      titleWrap.appendChild(desc);
    }
    if (desc instanceof HTMLElement) {
      desc.style.display = "block";
      desc.style.visibility = "visible";
      desc.style.opacity = "1";
    }
  }

  if (spacer instanceof HTMLElement) {
    spacer.classList.add("doc-assistant-settings__host-space");
  }
}

export function installSettingHostNormalizer(
  setting: SettingLike,
  panels: Array<HTMLElement | null>,
  rows: Array<SettingHostRowConfig | HTMLElement | null> = []
): void {
  const originalOpen = setting.open.bind(setting);
  const normalizeElements = () => {
    panels.forEach((panel) => normalizeSettingPanelHost(panel));
    rows.forEach((row) => {
      if (!row) {
        return;
      }
      if (row instanceof HTMLElement) {
        normalizeSettingRowHost(row);
      } else {
        normalizeSettingRowHost(row.element, row.fallbackDescription);
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

