import type { BookmarkNode, BookmarkTree } from "../types";
import type { BookmarkFileFormat } from "../types";

export interface JsonExportOptions {
  format?: Extract<BookmarkFileFormat, "chrome-json" | "generic-json">;
  pretty?: boolean;
  rootName?: string;
}

const CHROME_EPOCH_OFFSET = 11644473600000000; // microseconds between year 1601 and 1970

interface ChromeBookmarkNode {
  id: string;
  name: string;
  type: "url" | "folder";
  url?: string;
  date_added?: string;
  children?: ChromeBookmarkNode[];
}

interface ChromeBookmarkFile {
  checksum: string;
  roots: {
    bookmark_bar: ChromeBookmarkNode;
    other: ChromeBookmarkNode;
    synced: ChromeBookmarkNode;
  };
  version: string;
}

const ensureNodesArray = (tree: BookmarkTree | BookmarkNode[]): BookmarkNode[] =>
  Array.isArray(tree) ? tree : tree.nodes;

const toChromeEpoch = (timestamp?: number): string | undefined => {
  if (!timestamp) return undefined;
  const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const value = Math.round(millis * 1000 + CHROME_EPOCH_OFFSET);
  return value.toString();
};

const cloneNode = (node: BookmarkNode): BookmarkNode => ({
  id: node.id,
  title: node.title,
  url: node.url,
  children: node.children?.map(cloneNode),
  path: [...node.path],
  origin: node.origin,
  createdAt: node.createdAt,
  icon: node.icon,
  description: node.description,
});

const toChromeNode = (node: BookmarkNode): ChromeBookmarkNode => {
  const base: ChromeBookmarkNode = {
    id: node.id,
    name: node.title,
    type: node.children && node.children.length > 0 ? "folder" : "url",
  };

  const dateAdded = toChromeEpoch(node.createdAt);
  if (dateAdded) base.date_added = dateAdded;

  if (base.type === "url") {
    base.url = node.url ?? "";
    return base;
  }

  base.children = (node.children ?? []).map(toChromeNode);
  return base;
};

const createChromeFile = (
  nodes: BookmarkNode[],
  options: JsonExportOptions
): ChromeBookmarkFile => {
  const rootName = options.rootName ?? "Imported";
  const now = Date.now();
  const rootNode: ChromeBookmarkNode = {
    id: `root-${now.toString(36)}`,
    name: rootName,
    type: "folder",
    children: nodes.map(toChromeNode),
    date_added: toChromeEpoch(now),
  };

  const emptyFolder = (name: string): ChromeBookmarkNode => ({
    id: `${name}-${now.toString(36)}`,
    name,
    type: "folder",
    children: [],
    date_added: toChromeEpoch(now),
  });

  return {
    checksum: "",
    version: "1.0",
    roots: {
      bookmark_bar: rootNode,
      other: emptyFolder("其他书签"),
      synced: emptyFolder("移动书签"),
    },
  };
};

export async function toChromeJson(
  tree: BookmarkTree | BookmarkNode[],
  options: JsonExportOptions = {}
): Promise<string> {
  const nodes = ensureNodesArray(tree);
  const chromeFile = createChromeFile(nodes, options);
  return JSON.stringify(chromeFile, null, options.pretty ? 2 : 0);
}

export async function toGenericJson(
  tree: BookmarkTree | BookmarkNode[],
  options: JsonExportOptions = {}
): Promise<string> {
  const nodes = ensureNodesArray(tree).map(cloneNode);
  return JSON.stringify(nodes, null, options.pretty ? 2 : 0);
}

export async function toJson(
  tree: BookmarkTree | BookmarkNode[],
  options: JsonExportOptions = {}
): Promise<string> {
  const format = options.format ?? "generic-json";
  if (format === "chrome-json") {
    return toChromeJson(tree, options);
  }
  return toGenericJson(tree, options);
}
