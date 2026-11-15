import { PartialActionHandlerMap } from "@/plugin/action-runner-dispatcher";
import { createAiMarkerActionHandlers } from "@/plugin/action-runner-ai-marker-handlers";
import { createAiMediaActionHandlers } from "@/plugin/action-runner-ai-media-handlers";
import { createAiRelatedActionHandlers } from "@/plugin/action-runner-ai-related-handlers";
import { createAiSummaryActionHandlers } from "@/plugin/action-runner-ai-summary-handlers";
import { createAiWikiActionHandlers } from "@/plugin/action-runner-ai-wiki-handlers";
import { CreateAiActionHandlersOptions } from "@/plugin/action-runner-ai-types";

export function createAiActionHandlers(
  options: CreateAiActionHandlersOptions = {}
): PartialActionHandlerMap {
  return {
    ...createAiSummaryActionHandlers(options),
    ...createAiMarkerActionHandlers(options),
    ...createAiMediaActionHandlers(options),
    ...createAiRelatedActionHandlers(options),
    ...createAiWikiActionHandlers(options)
  };
}
