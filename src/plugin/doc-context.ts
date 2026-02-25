export type ProtyleBlockLike = {
  rootID?: string;
  rootId?: string;
  root_id?: string;
  id?: string;
};

export type ProtyleLike = {
  block?: ProtyleBlockLike;
  wysiwyg?: {
    element?: HTMLElement;
  };
};

export function getProtyleDocId(protyle?: ProtyleLike | null): string {
  return (
    protyle?.block?.rootID ||
    protyle?.block?.rootId ||
    protyle?.block?.root_id ||
    protyle?.block?.id ||
    ""
  );
}
