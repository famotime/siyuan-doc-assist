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
  private readonly storage = new Map<string, any>();

  public eventBus = {
    on: () => undefined,
    off: () => undefined,
  };

  addCommand(): void {}
  addDock(): void {}

  async loadData(storageName: string): Promise<any> {
    return this.storage.get(storageName);
  }

  async saveData(storageName: string, content: any): Promise<void> {
    this.storage.set(storageName, content);
  }

  async removeData(storageName: string): Promise<any> {
    const value = this.storage.get(storageName);
    this.storage.delete(storageName);
    return value;
  }
}

export class Dialog {
  public element = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  destroy(): void {}
}
