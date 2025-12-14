import type { BookmarkNode, BookmarkTree } from "../types";

export interface HtmlExportOptions {
  title?: string;
  rootTitle?: string;
  newline?: "\n" | "\r\n";
}

const DEFAULT_TITLE = "Bookmarks";
const DEFAULT_ROOT_TITLE = "Bookmarks";

const escapeText = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatTimestamp = (value?: number): string | undefined => {
  if (!value) return undefined;
  if (value > 1e12) {
    return Math.round(value / 1000).toString();
  }
  return Math.round(value).toString();
};

const renderNode = (
  node: BookmarkNode,
  indent: number,
  newline: string
): string => {
  const indentStr = "  ".repeat(indent);
  if (node.children && node.children.length > 0) {
    const attrs: string[] = [];
    const addDate = formatTimestamp(node.createdAt);
    if (addDate) attrs.push(`ADD_DATE="${addDate}"`);
    const header = `${indentStr}<DT><H3${attrs.length ? " " + attrs.join(" ") : ""}>${escapeText(
      node.title
    )}</H3>`;
    const children = node.children
      .map((child) => renderNode(child, indent + 1, newline))
      .join("");
    const description = node.description
      ? `${indentStr}<DD>${escapeText(node.description)}${newline}`
      : "";
    return [
      header + newline,
      `${indentStr}<DL><p>${newline}`,
      children,
      `${indentStr}</DL><p>${newline}`,
      description,
    ].join("");
  }

  const attrs: string[] = [];
  const addDate = formatTimestamp(node.createdAt);
  if (addDate) attrs.push(`ADD_DATE="${addDate}"`);
  if (node.icon) attrs.push(`ICON_URI="${escapeText(node.icon)}"`);
  const url = escapeText(node.url ?? "");
  const title = escapeText(node.title);
  const anchor = `${indentStr}<DT><A HREF="${url}"${attrs.length ? " " + attrs.join(" ") : ""}>${title}</A>${newline}`;
  const description = node.description
    ? `${indentStr}<DD>${escapeText(node.description)}${newline}`
    : "";
  return anchor + description;
};

const ensureNodesArray = (tree: BookmarkTree | BookmarkNode[]): BookmarkNode[] =>
  Array.isArray(tree) ? tree : tree.nodes;

export async function toChromeHtml(
  tree: BookmarkTree | BookmarkNode[],
  options: HtmlExportOptions = {}
): Promise<string> {
  const newline = options.newline ?? "\n";
  const title = escapeText(options.title ?? DEFAULT_TITLE);
  const rootTitle = escapeText(options.rootTitle ?? DEFAULT_ROOT_TITLE);
  const nodes = ensureNodesArray(tree);

  const header = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file. -->",
    "<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">",
    `<TITLE>${title}</TITLE>`,
    `<H1>${rootTitle}</H1>`,
    "<DL><p>"
  ].join(newline) + newline;

  const body = nodes.map((node) => renderNode(node, 1, newline)).join("");
  const footer = `</DL><p>${newline}`;

  return header + body + footer;
}

export async function toFirefoxHtml(
  tree: BookmarkTree | BookmarkNode[],
  options: HtmlExportOptions = {}
): Promise<string> {
  // Firefox 使用与 Chrome 相同的 Netscape 书签文件格式，差异仅在标题
  const firefoxOptions: HtmlExportOptions = {
    title: options.title ?? "Bookmarks",
    rootTitle: options.rootTitle ?? "Mozilla Firefox",
    newline: options.newline,
  };
  return toChromeHtml(tree, firefoxOptions);
}
