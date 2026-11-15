export type GestureDirection = "U" | "D" | "L" | "R" | "UL" | "UR" | "DL" | "DR";

export const GESTURE_DIRECTION_ARROWS: Record<GestureDirection, string> = {
  U: "↑",
  D: "↓",
  L: "←",
  R: "→",
  UL: "↖",
  UR: "↗",
  DL: "↙",
  DR: "↘"
};

export type GesturePoint = { x: number; y: number };

export type GestureRecognizerOptions = {
  /** 起始位移阈值：超过该距离才认定手势开始（区分普通右键点击） */
  startThreshold?: number;
  /** 分段位移阈值：相邻方向段之间需要积累的最小距离 */
  segmentThreshold?: number;
};

export const DEFAULT_GESTURE_START_THRESHOLD = 8;
export const DEFAULT_GESTURE_SEGMENT_THRESHOLD = 28;
export const MAX_GESTURE_LENGTH = 4;

const DIRECTION_BY_SECTOR: Record<number, GestureDirection> = {
  [-4]: "L",
  [-3]: "UL",
  [-2]: "U",
  [-1]: "UR",
  0: "R",
  1: "DR",
  2: "D",
  3: "DL",
  4: "L"
};

export function resolveDirection(deltaX: number, deltaY: number): GestureDirection {
  const angle = Math.atan2(deltaY, deltaX);
  const sector = Math.round(angle / (Math.PI / 4));
  return DIRECTION_BY_SECTOR[sector] || "L";
}

/**
 * 把鼠标轨迹增量识别为八方向序列。
 * 同向移动时参考点随之前移，避免长划中漂移积累出虚假方向段。
 */
export class GestureRecognizer {
  private readonly startThreshold: number;
  private readonly segmentThreshold: number;
  private originPoint: GesturePoint | null = null;
  private commitPoint: GesturePoint | null = null;
  private directions: GestureDirection[] = [];

  constructor(options: GestureRecognizerOptions = {}) {
    this.startThreshold = options.startThreshold ?? DEFAULT_GESTURE_START_THRESHOLD;
    this.segmentThreshold = options.segmentThreshold ?? DEFAULT_GESTURE_SEGMENT_THRESHOLD;
  }

  reset(): void {
    this.originPoint = null;
    this.commitPoint = null;
    this.directions = [];
  }

  /** 是否已越过起始阈值（区别于普通右键点击） */
  isMoved(): boolean {
    return this.directions.length > 0;
  }

  getDirections(): GestureDirection[] {
    return [...this.directions];
  }

  feed(x: number, y: number): GestureDirection[] {
    if (this.originPoint === null) {
      this.originPoint = { x, y };
      this.commitPoint = { x, y };
      return this.getDirections();
    }

    if (this.directions.length === 0) {
      const deltaX = x - this.originPoint.x;
      const deltaY = y - this.originPoint.y;
      // 用单轴分量判断起步：避免起点附近的小幅抖动被误判为对角线方向
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < this.startThreshold) {
        return this.getDirections();
      }
      this.directions.push(resolveDirection(deltaX, deltaY));
      this.commitPoint = { x, y };
      return this.getDirections();
    }

    const deltaX = x - this.commitPoint!.x;
    const deltaY = y - this.commitPoint!.y;
    if (Math.hypot(deltaX, deltaY) < this.segmentThreshold) {
      this.slideAnchorAlongLastDirection(x, y, deltaX, deltaY);
      return this.getDirections();
    }
    const direction = resolveDirection(deltaX, deltaY);
    const lastDirection = this.directions[this.directions.length - 1];
    if (direction !== lastDirection) {
      this.directions.push(direction);
    }
    this.commitPoint = { x, y };
    return this.getDirections();
  }

  /**
   * 未达到分段阈值时，沿上一方向滑动锚点消耗同向位移，
   * 避免拐角处纵向残量与横向位移累积成虚假的对角线段。
   */
  private slideAnchorAlongLastDirection(
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
  ): void {
    const lastDirection = this.directions[this.directions.length - 1];
    if (lastDirection === "U" || lastDirection === "D") {
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        this.commitPoint = { x: this.commitPoint!.x, y };
      }
      return;
    }
    if (lastDirection === "L" || lastDirection === "R") {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        this.commitPoint = { x, y: this.commitPoint!.y };
      }
    }
  }
}

export function serializeDirections(directions: GestureDirection[]): string {
  return directions.join(",");
}

export function parseGestureSequence(raw: string): GestureDirection[] {
  if (!raw) {
    return [];
  }
  const directions: GestureDirection[] = [];
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }
    if (!(trimmed in GESTURE_DIRECTION_ARROWS)) {
      return [];
    }
    directions.push(trimmed as GestureDirection);
  }
  return directions;
}

export function isValidGestureSequence(raw: string): boolean {
  const directions = parseGestureSequence(raw);
  return directions.length > 0 && directions.length <= MAX_GESTURE_LENGTH;
}

export function formatGestureSequence(raw: string): string {
  const directions = parseGestureSequence(raw);
  if (!directions.length) {
    return "未设置";
  }
  return directions.map((direction) => GESTURE_DIRECTION_ARROWS[direction]).join("");
}

export function formatDirectionHint(directions: GestureDirection[]): string {
  return directions.map((direction) => GESTURE_DIRECTION_ARROWS[direction]).join("");
}

/** 划动过程中的实时提示：方向箭头 + 命中的动作名称（未命中时仅箭头） */
export function formatGestureHint(
  directions: GestureDirection[],
  bindings: GestureBindings
): string {
  const arrows = formatDirectionHint(directions);
  if (!arrows) {
    return "";
  }
  const action = matchGestureAction(directions, bindings);
  return action ? `${arrows} ${MOUSE_GESTURE_ACTION_LABELS[action]}` : arrows;
}

export type MouseGestureActionKey = "previous-doc" | "next-doc" | "close-current-doc";

export type GestureBindings = Record<MouseGestureActionKey, string>;

export const MOUSE_GESTURE_ACTION_KEYS: MouseGestureActionKey[] = [
  "previous-doc",
  "next-doc",
  "close-current-doc"
];

export const MOUSE_GESTURE_ACTION_LABELS: Record<MouseGestureActionKey, string> = {
  "previous-doc": "切换上一个文档",
  "next-doc": "切换下一个文档",
  "close-current-doc": "关闭当前文档"
};

export const MOUSE_GESTURE_ACTION_HINTS: Record<MouseGestureActionKey, string> = {
  "previous-doc": "打开文档树中同一层级的上一个文档",
  "next-doc": "打开文档树中同一层级的下一个文档",
  "close-current-doc": "关闭当前文档标签页（不删除文档）"
};

export const DEFAULT_GESTURE_BINDINGS: GestureBindings = {
  "previous-doc": "L",
  "next-doc": "R",
  "close-current-doc": "D,R"
};

export function matchGestureAction(
  directions: GestureDirection[],
  bindings: GestureBindings
): MouseGestureActionKey | null {
  const sequence = serializeDirections(directions);
  for (const key of MOUSE_GESTURE_ACTION_KEYS) {
    if (bindings[key] === sequence) {
      return key;
    }
  }
  return null;
}

export function findGestureConflict(
  sequence: string,
  bindings: GestureBindings,
  excludeAction?: MouseGestureActionKey
): MouseGestureActionKey | null {
  for (const key of MOUSE_GESTURE_ACTION_KEYS) {
    if (key === excludeAction) {
      continue;
    }
    if (bindings[key] === sequence) {
      return key;
    }
  }
  return null;
}

export function normalizeGestureBindings(raw: unknown): GestureBindings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<
    Record<MouseGestureActionKey, unknown>
  >;
  const used = new Set<string>();
  const result = {} as GestureBindings;
  for (const key of MOUSE_GESTURE_ACTION_KEYS) {
    const candidate = typeof source[key] === "string" ? (source[key] as string) : "";
    let sequence = isValidGestureSequence(candidate) ? candidate : DEFAULT_GESTURE_BINDINGS[key];
    if (used.has(sequence)) {
      sequence = DEFAULT_GESTURE_BINDINGS[key];
    }
    used.add(sequence);
    result[key] = sequence;
  }
  return result;
}
