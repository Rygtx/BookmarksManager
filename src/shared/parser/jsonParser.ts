import type { BookmarkNode, BookmarkOrigin, BookmarkTree } from "../types";

export interface JsonParseOptions {
  origin?: BookmarkOrigin;
  rootId?: string;
  rootTitle?: string;
}

interface RawBookmarkNode {
  id?: string | number;
  guid?: string;
  name?: string;
  title?: string;
  url?: string;
  uri?: string;
  type?: string;
  children?: RawBookmarkNode[];
  roots?: Record<string, RawBookmarkNode>;
  date_added?: string;
  dateAdded?: number;
  add_date?: string;
  last_modified?: string;
  description?: string;
}

const DEFAULT_ROOT_TITLE = "Imported JSON Bookmarks";
const CHROME_EPOCH_OFFSET = 11644473600000000; // microseconds between 1601 and 1970

const createId = (() => {
  let counter = 0;
  return (prefix = "bm") => {
    const random = () => Math.random().toString(36).slice(2, 8);
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${random()}`;
  };
})();

const toNumber = (value?: string | number): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const fromChromeEpoch = (value?: string | number): number | undefined => {
  const microseconds = toNumber(value);
  if (!microseconds) return undefined;
  if (microseconds > CHROME_EPOCH_OFFSET) {
    return Math.round((microseconds - CHROME_EPOCH_OFFSET) / 1000);
  }
  if (microseconds > 1e12) {
    return microseconds; // already milliseconds
  }
  return microseconds * 1000;
};

const normaliseTitle = (value?: string): string => {
  const title = value?.trim();
  return title && title.length > 0 ? title : "未命名";
};

const buildBookmarkNode = (
  raw: RawBookmarkNode,
  parentPath: string[],
  origin: BookmarkOrigin
): BookmarkNode => {
  const title = normaliseTitle(raw.name ?? raw.title);
  const path = [...parentPath, title];
  const id = raw.id ? String(raw.id) : raw.guid ?? createId(raw.url ? "url" : "fld");
  const createdAt =
    fromChromeEpoch(raw.date_added) ??
    fromChromeEpoch(raw.dateAdded) ??
    fromChromeEpoch(raw.add_date) ??
    toNumber(raw.last_modified);

  const isFolder = (raw.type ?? "").toLowerCase() === "folder" || Array.isArray(raw.children);

  if (isFolder) {
    const children = (raw.children ?? []).map((child) => buildBookmarkNode(child, path, origin));
    return {
      id,
      title,
      children,
      path,
      origin,
      createdAt,
      description: raw.description ?? undefined,
    };
  }

  return {
    id,
    title,
    url: raw.url ?? raw.uri ?? "",
    path,
    origin,
    createdAt,
    description: raw.description ?? undefined,
  };
};

const collectRoots = (
  payload: RawBookmarkNode | RawBookmarkNode[] | Record<string, RawBookmarkNode>,
  origin: BookmarkOrigin
): BookmarkNode[] => {
  if (Array.isArray(payload)) {
    return payload.map((entry) => buildBookmarkNode(entry, [], origin));
  }

  if (payload && typeof payload === "object" && "roots" in payload && payload.roots) {
    const entries: BookmarkNode[] = [];
    const roots = payload.roots as Record<string, RawBookmarkNode>;
    for (const key of Object.keys(roots)) {
      const rootNode = roots[key];
      if (!rootNode) continue;
      const node = buildBookmarkNode(rootNode, [], origin);
      entries.push(node);
    }
    return entries;
  }

  if (payload && typeof payload === "object" && "children" in payload) {
    const rootNode = buildBookmarkNode(payload, [], origin);
    if (rootNode.children) {
      return rootNode.children;
    }
    return [rootNode];
  }

  throw new Error("无法识别的书签 JSON 结构");
};

export async function parseJsonBookmarks(
  content: string,
  options: JsonParseOptions = {}
): Promise<BookmarkTree> {
  const origin: BookmarkOrigin = options.origin ?? "left";
  let payload: unknown;
  try {
    payload = JSON.parse(content) as RawBookmarkNode | RawBookmarkNode[];
  } catch (error) {
    throw new Error(`JSON 解析失败: ${(error as Error).message}`);
  }

  const nodes = collectRoots(payload as RawBookmarkNode | RawBookmarkNode[] | Record<string, RawBookmarkNode>, origin);
  const rootId = options.rootId ?? createId("root");

  return {
    rootId,
    nodes,
    origin,
  };
}
