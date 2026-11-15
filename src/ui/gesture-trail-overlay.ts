import { GesturePoint } from "@/core/gesture-recognition-core";

const TRAIL_ID = "doc-assistant-gesture-trail";
const HIDDEN_CLASS = "is-hidden";
const LABEL_CLASS = "doc-assistant-gesture-trail__label";

let rootElement: HTMLElement | null = null;
let canvasElement: HTMLCanvasElement | null = null;
let labelElement: HTMLElement | null = null;

function getStrokeColor(): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "#7c5cff";
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--b3-theme-primary")
    ?.trim();
  return value || "#7c5cff";
}

function ensureOverlay(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (rootElement && document.getElementById(TRAIL_ID) === rootElement) {
    return rootElement;
  }
  const existing = document.getElementById(TRAIL_ID);
  if (existing) {
    rootElement = existing;
    canvasElement = existing.querySelector("canvas");
    labelElement = existing.querySelector(`.${LABEL_CLASS}`);
    return rootElement;
  }

  rootElement = document.createElement("div");
  rootElement.id = TRAIL_ID;
  rootElement.className = `doc-assistant-gesture-trail ${HIDDEN_CLASS}`;

  canvasElement = document.createElement("canvas");
  rootElement.appendChild(canvasElement);

  labelElement = document.createElement("div");
  labelElement.className = LABEL_CLASS;
  rootElement.appendChild(labelElement);

  document.body.appendChild(rootElement);
  return rootElement;
}

function resizeCanvas(): void {
  if (!canvasElement || typeof window === "undefined") {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  canvasElement.width = Math.floor(width * ratio);
  canvasElement.height = Math.floor(height * ratio);
  const context = canvasElement.getContext("2d");
  if (context) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function clearCanvas(): void {
  const context = canvasElement?.getContext("2d");
  if (context && canvasElement) {
    context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  }
}

export function showGestureTrail(): void {
  const overlay = ensureOverlay();
  if (!overlay) {
    return;
  }
  resizeCanvas();
  clearCanvas();
  overlay.classList.remove(HIDDEN_CLASS);
}

export function drawGestureTrail(points: GesturePoint[], hint?: string): void {
  if (!ensureOverlay() || !canvasElement) {
    return;
  }
  const context = canvasElement.getContext("2d");
  if (!context) {
    return;
  }
  clearCanvas();
  if (points.length > 1) {
    context.save();
    context.strokeStyle = getStrokeColor();
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
    context.restore();
  }
  if (labelElement) {
    const last = points[points.length - 1];
    if (hint && last) {
      labelElement.textContent = hint;
      labelElement.style.left = `${last.x}px`;
      labelElement.style.top = `${last.y}px`;
      labelElement.classList.remove(HIDDEN_CLASS);
    } else {
      labelElement.classList.add(HIDDEN_CLASS);
    }
  }
}

export function hideGestureTrail(): void {
  if (!rootElement) {
    return;
  }
  clearCanvas();
  labelElement?.classList.add(HIDDEN_CLASS);
  rootElement.classList.add(HIDDEN_CLASS);
}

export function destroyGestureTrail(): void {
  rootElement?.remove();
  rootElement = null;
  canvasElement = null;
  labelElement = null;
}
