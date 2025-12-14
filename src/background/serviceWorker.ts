import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import { MessageCommand } from "../shared/messages";
import type {
  BookmarkTree,
  BookmarkSide,
  BookmarkImportPayload,
  BookmarkReadOptions,
  ExportOptions,
  UserPreferences,
  QueuedDiffOperation,
} from "../shared/types";
import { parseHtmlBookmarks, parseJsonBookmarks } from "../shared/parser";
import { computeDiff } from "../shared/diff";
import { applyOperations } from "../shared/diff";
import { toChromeHtml, toFirefoxHtml, toJson } from "../shared/exporter";

interface ExtensionState {
  leftTree: BookmarkTree | null;
  rightTree: BookmarkTree | null;
  preferences: UserPreferences | null;
}

const state: ExtensionState = {
  leftTree: null,
  rightTree: null,
  preferences: null,
};

const respond = async <C extends RuntimeResponse["command"]>(
  request: RuntimeRequest,
  payload: RuntimeResponse["payload"]
) => {
  return {
    command: request.command,
    requestId: request.requestId,
    success: true,
    payload,
  } as RuntimeResponse;
};

const respondError = async (request: RuntimeRequest, error: unknown): Promise<RuntimeResponse> => {
  console.error("操作失败", request.command, error);
  return {
    command: request.command,
    requestId: request.requestId,
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error ?? "未知错误"),
    },
  };
};

const detectFormat = (payload: BookmarkImportPayload): "html" | "json" => {
  const name = payload.file.name.toLowerCase();
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (name.endsWith(".json")) return "json";
  if (payload.content.trim().startsWith("{")) return "json";
  return "html";
};

const assignTree = (tree: BookmarkTree, side: BookmarkSide) => {
  if (side === "left") {
    state.leftTree = tree;
  } else {
    state.rightTree = tree;
  }
};

const ensureBookmarkTree = (side: BookmarkSide): BookmarkTree => {
  const tree = side === "left" ? state.leftTree : state.rightTree;
  if (!tree) {
    throw new Error(side === "left" ? "左侧书签尚未加载" : "右侧书签尚未加载");
  }
  return tree;
};

const readBrowserBookmarks = async (
  side: BookmarkSide,
  options?: BookmarkReadOptions
): Promise<BookmarkTree> => {
  const includeFavicons = Boolean(options?.includeFavicons);
  const tree = await chrome.bookmarks.getTree();
  const normaliseNode = (node: chrome.bookmarks.BookmarkTreeNode, path: string[]): BookmarkTree["nodes"][number] => {
    const currentPath = node.title ? [...path, node.title] : path;
    const base = {
      id: node.id,
      title: node.title || "未命名",
      path: currentPath,
      origin: side,
      createdAt: node.dateAdded,
      icon: includeFavicons ? undefined : undefined,
    };
    if (node.children && node.children.length > 0) {
      return {
        ...base,
        children: node.children.map((child) => normaliseNode(child, currentPath)),
      };
    }
    return {
      ...base,
      url: node.url ?? "",
    };
  };

  const nodes = tree.flatMap((root) => (root.children ?? []).map((child) => normaliseNode(child, [])));
  const bookmarkTree: BookmarkTree = {
    rootId: `browser-${side}`,
    origin: side,
    nodes,
  };
  assignTree(bookmarkTree, side);
  return bookmarkTree;
};

const importFromFile = async (
  payload: BookmarkImportPayload
): Promise<{ tree: BookmarkTree; importedAt: number }> => {
  const format = detectFormat(payload);
  const origin = payload.side;
  const parser = format === "html" ? parseHtmlBookmarks : parseJsonBookmarks;
  const tree = await parser(payload.content, {
    origin,
    rootId: `${origin}-import-${Date.now()}`,
  });
  assignTree(tree, origin);
  return { tree, importedAt: Date.now() };
};

const computeDiffSafe = () => {
  if (!state.leftTree || !state.rightTree) {
    throw new Error("需先导入左右两侧书签");
  }
  return computeDiff(state.leftTree, state.rightTree, {
    includeDuplicates: true,
    compareBy: "both",
  });
};

const applyDiffOperations = async (
  operations: QueuedDiffOperation[],
  options?: { recompute?: boolean }
) => {
  if (!state.leftTree || !state.rightTree) {
    throw new Error("需先加载左右书签后才能应用差异");
  }
  const result = applyOperations({
    left: state.leftTree,
    right: state.rightTree,
    operations,
    options: {
      defaultTargetSide: "right",
      recomputeDiff: Boolean(options?.recompute),
    },
  });
  state.leftTree = result.left;
  state.rightTree = result.right;
  return result;
};

const exportBookmarks = async (
  tree: BookmarkTree,
  options: ExportOptions
): Promise<{ downloadId: string; fileName: string; size: number }> => {
  let blobContent: string;
  let mimeType: string;
  switch (options.format) {
    case "chrome-html":
      blobContent = await toChromeHtml(tree);
      mimeType = "text/html";
      break;
    case "firefox-html":
      blobContent = await toFirefoxHtml(tree);
      mimeType = "text/html";
      break;
    case "chrome-json":
      blobContent = await toJson(tree, { format: "chrome-json", pretty: options.pretty });
      mimeType = "application/json";
      break;
    case "generic-json":
    default:
      blobContent = await toJson(tree, { format: "generic-json", pretty: options.pretty });
      mimeType = "application/json";
      break;
  }

  const fileName = options.fileName ?? `bookmarks-${Date.now()}`;
  const extension = options.format.includes("html") ? "html" : "json";
  const blob = new Blob([blobContent], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const downloadId = await chrome.downloads.download({
    url,
    filename: `${fileName}.${extension}`,
    saveAs: true,
  });

  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return {
    downloadId: String(downloadId ?? ""),
    fileName,
    size: blobContent.length,
  };
};

const savePreferences = async (preferences: Partial<UserPreferences>) => {
  const existing = state.preferences ?? {
    theme: "system",
    diffView: "combined",
    expandByDefault: true,
    showFavicons: true,
  };
  const next: UserPreferences = {
    ...existing,
    ...preferences,
  };
  state.preferences = next;
  await chrome.storage.sync.set({ "bookmark-comparison-preferences": next });
  return next;
};

const restorePreferences = async (): Promise<UserPreferences | null> => {
  if (state.preferences) return state.preferences;
  const result = await chrome.storage.sync.get("bookmark-comparison-preferences");
  const data = result["bookmark-comparison-preferences"] as UserPreferences | undefined;
  if (!data) {
    state.preferences = {
      theme: "system",
      diffView: "combined",
      expandByDefault: true,
      showFavicons: true,
    };
  } else {
    state.preferences = data;
  }
  return state.preferences;
};

const resetState = (scope?: BookmarkSide | "all") => {
  if (!scope || scope === "all") {
    state.leftTree = null;
    state.rightTree = null;
    return;
  }
  if (scope === "left") {
    state.leftTree = null;
  } else {
    state.rightTree = null;
  }
};

const handleRequest = async (request: RuntimeRequest): Promise<RuntimeResponse> => {
  try {
    const command = request.command;
    switch (command) {
      case MessageCommand.Ping:
        return respond(request, { alive: true, timestamp: Date.now() });
      case MessageCommand.ImportFile:
        return respond(request, await importFromFile(request.payload));
      case MessageCommand.ReadBrowserBookmarks:
        return respond(request, {
          tree: await readBrowserBookmarks(request.payload.side, request.payload.options),
          fetchedAt: Date.now(),
        });
      case MessageCommand.ComputeDiff:
        return respond(request, {
          ...computeDiffSafe(),
          generatedAt: Date.now(),
        });
      case MessageCommand.ApplyOperations: {
        const result = await applyDiffOperations(request.payload.operations, {
          recompute: true,
        });
        return respond(request, {
          left: result.left,
          right: result.right,
          diffs: result.diffs,
          summary: result.summary,
        });
      }
      case MessageCommand.ExportBookmarks:
        return respond(request, await exportBookmarks(request.payload.tree, request.payload.options));
      case MessageCommand.SavePreferences:
        return respond(request, {
          preferences: await savePreferences(request.payload.preferences),
          savedAt: Date.now(),
        });
      case MessageCommand.RestorePreferences:
        return respond(request, { preferences: await restorePreferences() });
      case MessageCommand.ResetState:
        resetState(request.payload.scope);
        return respond(request, { ok: true, scope: request.payload.scope ?? "all" });
      default:
        throw new Error(`未处理的命令: ${command}`);
    }
  } catch (error) {
    return respondError(request, error);
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const runtimeMessage = message as RuntimeRequest;
  Promise.resolve(handleRequest(runtimeMessage))
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error("消息处理失败", error);
      const fallback: RuntimeResponse = {
        command: runtimeMessage.command,
        requestId: runtimeMessage.requestId,
        success: false,
        error: {
          code: "UNHANDLED_ERROR",
          message: error instanceof Error ? error.message : String(error ?? "未知错误"),
        },
      };
      sendResponse(fallback);
    });
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.info("书签对比助手已安装");
});
