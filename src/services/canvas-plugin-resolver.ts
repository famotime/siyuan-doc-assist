export type CanvasPluginLike = {
  openCanvasTab?: (bootstrap?: { path?: string; raw?: string; title?: string }) => Promise<void>;
};

export function resolveCanvasPluginFromPlugins(
  plugins: Array<{ name?: string }> | undefined
): CanvasPluginLike | null {
  if (!Array.isArray(plugins)) {
    return null;
  }
  return (plugins.find((plugin) => plugin?.name === "siyuan-canvas") as CanvasPluginLike) || null;
}
