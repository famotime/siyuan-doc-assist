type PluginEventHandler = (event: CustomEvent<any>) => void;

type PluginEventBusLike = {
  on: (name: string, handler: PluginEventHandler) => void;
  off: (name: string, handler: PluginEventHandler) => void;
};

type PluginLifecycleHandlers = {
  onSwitchProtyle: PluginEventHandler;
  onEditorTitleMenu: PluginEventHandler;
  onContentMenu?: PluginEventHandler;
  onDocTreeMenu?: PluginEventHandler;
};

export function bindPluginLifecycleEvents(
  eventBus: PluginEventBusLike,
  handlers: PluginLifecycleHandlers
) {
  eventBus.on("switch-protyle", handlers.onSwitchProtyle);
  eventBus.on("click-editortitleicon", handlers.onEditorTitleMenu);
  if (handlers.onContentMenu) {
    eventBus.on("open-menu-content", handlers.onContentMenu);
  }
  if (handlers.onDocTreeMenu) {
    eventBus.on("open-menu-doctree", handlers.onDocTreeMenu);
  }
}

export function unbindPluginLifecycleEvents(
  eventBus: PluginEventBusLike,
  handlers: PluginLifecycleHandlers
) {
  eventBus.off("switch-protyle", handlers.onSwitchProtyle);
  eventBus.off("click-editortitleicon", handlers.onEditorTitleMenu);
  if (handlers.onContentMenu) {
    eventBus.off("open-menu-content", handlers.onContentMenu);
  }
  if (handlers.onDocTreeMenu) {
    eventBus.off("open-menu-doctree", handlers.onDocTreeMenu);
  }
}
