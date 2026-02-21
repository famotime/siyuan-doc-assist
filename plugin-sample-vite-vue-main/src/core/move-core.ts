type MoveSourceDoc = {
  id: string;
  title: string;
  parentId?: string;
};

type MovePlanInput = {
  sourceDoc: MoveSourceDoc;
  targetParentId: string;
  existingChildTitles: string[];
};

type MovePlanResult =
  | { action: "skip"; reason: "already-child" }
  | { action: "move" }
  | { action: "rename-and-move"; newTitle: string };

function buildUniqueTitle(baseTitle: string, existingTitles: Set<string>): string {
  let index = 1;
  let next = `${baseTitle} (${index})`;
  while (existingTitles.has(next)) {
    index += 1;
    next = `${baseTitle} (${index})`;
  }
  return next;
}

export function planMoveWithConflictHandling(
  input: MovePlanInput
): MovePlanResult {
  if (input.sourceDoc.parentId === input.targetParentId) {
    return {
      action: "skip",
      reason: "already-child",
    };
  }

  const existingTitles = new Set(input.existingChildTitles);
  if (!existingTitles.has(input.sourceDoc.title)) {
    return {
      action: "move",
    };
  }

  return {
    action: "rename-and-move",
    newTitle: buildUniqueTitle(input.sourceDoc.title, existingTitles),
  };
}
