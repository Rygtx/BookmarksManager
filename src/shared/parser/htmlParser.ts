import type { BookmarkNode, BookmarkOrigin, BookmarkTree } from "../types";

export interface HtmlParseOptions {
  origin?: BookmarkOrigin;
  rootId?: string;
  rootTitle?: string;
}

const DEFAULT_ROOT_TITLE = "Imported HTML Bookmarks";

const createId = (() => {
  let counter = 0;
  return (prefix = "bm") => {
    const random = () => Math.random().toString(36).slice(2, 8);
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch (_error) {
      // ignore and fallback below
    }
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${random()}`;
  };
})();

const decodeHtmlEntities = (value: string): string => {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_match, entity) => {
    if (entity[0] === "#") {
      const codePoint = entity[1]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    }
    const entities: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'",
      nbsp: " "
    };
    return entities[entity] ?? "";
  });
};

const parseAttributes = (raw: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const regex = /([A-Z_:-]+)\s*=\s*"([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw))) {
    attributes[match[1].toLowerCase()] = match[2];
  }
  return attributes;
};

const parseTimestamp = (value?: string): number | undefined => {
  if (!value) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  if (numeric > 1e15) return numeric; // already microseconds
  if (numeric > 1e12) return numeric; // assume milliseconds
  return numeric * 1000; // treat as seconds
};

const attachNode = (
  node: BookmarkNode,
  stack: BookmarkNode[],
  roots: BookmarkNode[]
) => {
  const parent = stack[stack.length - 1];
  if (parent) {
    if (!parent.children) parent.children = [];
    parent.children.push(node);
  } else {
    roots.push(node);
  }
};

export async function parseHtmlBookmarks(
  content: string,
  options: HtmlParseOptions = {}
): Promise<BookmarkTree> {
  const origin: BookmarkOrigin = options.origin ?? "left";
  const rootNodes: BookmarkNode[] = [];
  const folderStack: BookmarkNode[] = [];
  let lastNode: BookmarkNode | null = null;

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("<!") || line.startsWith("<META") || line.startsWith("<TITLE")) {
      continue;
    }

    if (line.toUpperCase().startsWith("</DL")) {
      folderStack.pop();
      lastNode = folderStack[folderStack.length - 1] ?? null;
      continue;
    }

    if (line.toUpperCase().startsWith("<DL")) {
      continue; // children container marker
    }

    const folderMatch = line.match(/<DT><H3([^>]*)>(.*?)<\/H3>/i);
    if (folderMatch) {
      const attrs = parseAttributes(folderMatch[1] ?? "");
      const title = decodeHtmlEntities(folderMatch[2]?.trim() ?? "未命名文件夹");
      const parentPath = folderStack[folderStack.length - 1]?.path ?? [];
      const path = [...parentPath, title];
      const folderNode: BookmarkNode = {
        id: attrs.id ?? createId("fld"),
        title,
        children: [],
        path,
        origin,
        createdAt: parseTimestamp(attrs["add_date"]) ?? parseTimestamp(attrs["last_modified"])
      };
      attachNode(folderNode, folderStack, rootNodes);
      folderStack.push(folderNode);
      lastNode = folderNode;
      continue;
    }

    const linkMatch = line.match(/<DT><A\s+([^>]*)>(.*?)<\/A>/i);
    if (linkMatch) {
      const attrs = parseAttributes(linkMatch[1] ?? "");
      const title = decodeHtmlEntities(linkMatch[2]?.trim() ?? "无标题书签");
      const parentPath = folderStack[folderStack.length - 1]?.path ?? [];
      const path = [...parentPath, title];
      const bookmarkNode: BookmarkNode = {
        id: attrs.id ?? createId("url"),
        title,
        url: attrs.href ?? "",
        path,
        origin,
        createdAt: parseTimestamp(attrs["add_date"]),
        icon: attrs.icon ?? attrs.icon_uri
      };
      attachNode(bookmarkNode, folderStack, rootNodes);
      lastNode = bookmarkNode;
      continue;
    }

    if (line.startsWith("<DD>")) {
      if (lastNode) {
        lastNode.description = decodeHtmlEntities(line.slice(4).trim());
      }
      continue;
    }
  }

  const rootId = options.rootId ?? createId("root");
  return {
    rootId,
    nodes: rootNodes,
    origin,
  };
}
