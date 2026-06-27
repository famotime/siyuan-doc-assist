import { AiServiceConfig } from "@/core/ai-service-config-core";
import { NetworkLensPluginLike } from "@/services/network-lens-ai-index";
import type { ConfirmDetailItem } from "@/plugin/action-runner";
import { CanvasPluginLike } from "@/services/canvas-plugin-resolver";

export type CreateAiActionHandlersOptions = {
  getAiSummaryConfig?: () => AiServiceConfig | undefined;
  askConfirmWithVisibleDialog?: (
    title: string,
    text: string,
    detailItems?: ConfirmDetailItem[]
  ) => Promise<boolean>;
  resolveNetworkLensPlugin?: () => NetworkLensPluginLike | null | undefined;
  resolveCanvasPlugin?: () => CanvasPluginLike | null | undefined;
  setBusy?: (busy: boolean) => void;
};
