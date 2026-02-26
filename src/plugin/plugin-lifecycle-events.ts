type PluginEventHandler = (event: CustomEvent<any>) => void;

type PluginEventBusLike = {
  on: (name: string, handler: PluginEventHandler) => void;
  off: (name: string, handler: PluginEventHandler) => void;
};

type PluginLifecycleHandlers = {
  onSwitchProtyle: PluginEventHandler;
  onEditorTitleMenu: PluginEventHandler;
};

export function bindPluginLifecycleEvents(
  eventBus: PluginEventBusLike,
  handlers: PluginLifecycleHandlers
) {
  eventBus.on("switch-protyle", handlers.onSwitchProtyle);
  eventBus.on("click-editortitleicon", handlers.onEditorTitleMenu);
}

export function unbindPluginLifecycleEvents(
  eventBus: PluginEventBusLike,
  handlers: PluginLifecycleHandlers
) {
  eventBus.off("switch-protyle", handlers.onSwitchProtyle);
  eventBus.off("click-editortitleicon", handlers.onEditorTitleMenu);
}
