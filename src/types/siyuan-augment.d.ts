declare module "siyuan" {
  export type IWebSocketData = {
    code: number;
    msg?: string;
    data?: any;
  };

  export function fetchSyncPost(url: string, data?: any): Promise<IWebSocketData>;
  export function showMessage(
    msg: string,
    timeout?: number,
    type?: "info" | "error" | "warn"
  ): void;
  export function confirm(
    title: string,
    text: string,
    yes?: () => void,
    no?: () => void
  ): void;
  export function getFrontend(): string;
  export function getActiveEditor():
    | {
        protyle?: unknown;
      }
    | undefined;

  export const Plugin: {
    new (...args: any[]): {
      name: string;
      eventBus: {
        on: (name: string, handler: (...args: any[]) => void) => void;
        off: (name: string, handler: (...args: any[]) => void) => void;
      };
      addDock: (config: any) => void;
      addCommand: (config: any) => void;
      openSetting(): void;
      loadData: (storageName: string) => Promise<any>;
      saveData: (storageName: string, content: any) => Promise<void>;
      removeData: (storageName: string) => Promise<any>;
    };
  };

  export const Dialog: {
    new (options: any): {
      element: HTMLElement;
      destroy: () => void;
    };
  };

  export const Setting: {
    new (options: {
      height?: string;
      width?: string;
      destroyCallback?: () => void;
      confirmCallback?: () => void;
    }): {
      addItem: (options: {
        title: string;
        direction?: "column" | "row";
        description?: string;
        actionElement?: HTMLElement;
        createActionElement?: () => HTMLElement;
      }) => void;
      open: (name: string) => void;
    };
  };
}
