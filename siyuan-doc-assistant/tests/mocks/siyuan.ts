export type IWebSocketData = {
  code: number;
  msg: string;
  data: any;
};

export async function fetchSyncPost(): Promise<IWebSocketData> {
  return {
    code: 0,
    msg: "",
    data: null,
  };
}

export function showMessage(): void {}

export function confirm(
  _title: string,
  _text: string,
  onConfirm?: () => void,
  _onCancel?: () => void
): void {
  onConfirm?.();
}

export function getActiveEditor(): any {
  return undefined;
}

export function getFrontend(): string {
  return "desktop";
}

export class Plugin {
  public eventBus = {
    on: () => undefined,
    off: () => undefined,
  };

  addCommand(): void {}
}

export class Dialog {
  public element = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  destroy(): void {}
}
