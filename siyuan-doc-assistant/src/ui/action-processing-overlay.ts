const OVERLAY_ID = "doc-assistant-action-processing-overlay";
const TEXT_CLASS = "doc-assistant-action-processing__text";
const VISIBLE_CLASS = "is-visible";

let refCount = 0;

function createOverlay(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    return existing;
  }

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "doc-assistant-action-processing";

  const card = document.createElement("div");
  card.className = "doc-assistant-action-processing__card";

  const spinner = document.createElement("span");
  spinner.className = "doc-assistant-action-processing__spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = TEXT_CLASS;
  text.textContent = "处理中，请稍候...";

  card.appendChild(spinner);
  card.appendChild(text);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return overlay;
}

export function showActionProcessingOverlay(text = "处理中，请稍候..."): void {
  const overlay = createOverlay();
  if (!overlay) {
    return;
  }
  refCount += 1;
  const label = overlay.querySelector(`.${TEXT_CLASS}`);
  if (label) {
    label.textContent = text;
  }
  overlay.classList.add(VISIBLE_CLASS);
}

export function hideActionProcessingOverlay(): void {
  if (typeof document === "undefined") {
    return;
  }
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    refCount = 0;
    return;
  }

  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) {
    return;
  }
  overlay.classList.remove(VISIBLE_CLASS);
}

export function destroyActionProcessingOverlay(): void {
  if (typeof document === "undefined") {
    return;
  }
  refCount = 0;
  const overlay = document.getElementById(OVERLAY_ID);
  overlay?.remove();
}
