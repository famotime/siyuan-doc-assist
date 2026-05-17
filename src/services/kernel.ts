import { requestApi } from "@/services/request";

export {
  appendBlock,
  deleteBlocksByIds,
  deleteBlockById,
  getBlockDOM,
  getBlockDOMs,
  getBlockKramdown,
  getBlockKramdowns,
  getChildBlockRefsByParentId,
  getChildBlocksByParentId,
  insertBlockBefore,
  updateBlockDom,
  updateBlockMarkdown,
} from "@/services/kernel-block";
export type {
  ChildBlockMeta,
  ChildBlockRef,
  DeleteBlocksResult,
} from "@/services/kernel-block";

export { DOC_READONLY_ATTR_KEY } from "@/services/kernel-attr";
export type { BlockAttrs } from "@/services/kernel-attr";
export {
  getBlockAttrs,
  getDocReadonlyState,
  isReadonlyAttrValue,
  setBlockAttrs,
} from "@/services/kernel-attr";

export {
  getFileBlob,
  getPathByID,
  listDocsByPath,
  moveDocsByID,
  putBlobFile,
  putFile,
  removeDocByID,
  removeFile,
  renameDocByID,
} from "@/services/kernel-file";
export type { FileTreeDoc, PathInfo } from "@/services/kernel-file";

export {
  getBacklinkSourceDocIdsFromMarkdown,
  getBacklinkSourceDocIdsFromRefs,
  getForwardRefTargetBlockIds,
  getRootDocRawMarkdown,
  listDocsByParentSubtree,
  mapBlockIdsToRootDocIds,
} from "@/services/kernel-ref";

export { forwardProxy } from "@/services/kernel-network";
export type {
  ForwardProxyHeader,
  ForwardProxyResponse,
} from "@/services/kernel-network";

export { sql } from "@/services/kernel-shared";

export {
  getChildDocTitles,
  getChildDocsByParent,
  getDocMetaByID,
  getDocMetasByIDs,
  getDocTreeOrderFromSy,
  listNotebookDocs,
} from "@/services/kernel-doc-query";
export type {
  ChildDocMeta,
  DocMeta,
  NotebookDocMeta,
} from "@/services/kernel-doc-query";

type BacklinkPath = {
  id: string;
  box: string;
  hPath: string;
  name: string;
  updated: string;
};

type Backlink2Res = {
  backlinks: BacklinkPath[];
  linkRefsCount: number;
  backmentions: BacklinkPath[];
  mentionsCount: number;
};

type ExportMdContentRes = {
  hPath: string;
  content: string;
};

type ExportMdContentOptions = {
  refMode?: number;
  embedMode?: number;
  addTitle?: boolean;
  yfm?: boolean;
  fillCSSVar?: boolean;
  adjustHeadingLevel?: boolean;
  imgTag?: boolean;
};

type ExportMdsRes = {
  name: string;
  zip: string;
};

type ExportResourcesRes = {
  path: string;
};

export type NotebookConfResponse = {
  box: string;
  conf: NotebookConf;
  name: string;
};

export async function getBacklink2(
  id: string,
  containChildren = false
): Promise<Backlink2Res> {
  return requestApi<Backlink2Res>("/api/ref/getBacklink2", {
    id,
    k: "",
    mk: "",
    containChildren,
  });
}

export async function exportMdContent(
  id: string,
  options: ExportMdContentOptions = {}
): Promise<ExportMdContentRes> {
  return requestApi<ExportMdContentRes>("/api/export/exportMdContent", {
    id,
    ...options,
  });
}

export async function exportMds(ids: string[]): Promise<ExportMdsRes> {
  return requestApi<ExportMdsRes>("/api/export/exportMds", { ids });
}

export async function exportResources(
  paths: string[],
  name: string
): Promise<ExportResourcesRes> {
  return requestApi<ExportResourcesRes>("/api/export/exportResources", {
    paths,
    name,
  });
}

export async function createDocWithMd(
  notebook: string,
  path: string,
  markdown: string
): Promise<string> {
  return requestApi<string>("/api/filetree/createDocWithMd", {
    notebook,
    path,
    markdown,
  });
}

export async function getNotebookConf(
  notebook: string
): Promise<NotebookConfResponse> {
  return requestApi<NotebookConfResponse>("/api/notebook/getNotebookConf", {
    notebook,
  });
}

export async function renderSprigTemplate(template: string): Promise<string> {
  return requestApi<string>("/api/template/renderSprig", {
    template,
  });
}

export async function getDocAssets(id: string): Promise<unknown> {
  return requestApi("/api/asset/getDocAssets", { id });
}

export async function statAsset(path: string): Promise<unknown> {
  return requestApi("/api/asset/statAsset", { path });
}
