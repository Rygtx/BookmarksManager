import type {
  BookmarkNode,
  BookmarkTree,
  BookmarkSide,
  DiffResult,
  DiffSummary,
  QueuedDiffOperation
} from "../types";
import { computeDiff, type ComputeDiffOptions, type ComputeDiffPayload } from "./diffEngine";

export interface ApplyOperationsOptions {
  defaultTargetSide?: BookmarkSide;
  diffOptions?: ComputeDiffOptions;
  recomputeDiff?: boolean;
  cleanupEmptyFolders?: boolean;
}

export interface ApplyOperationsResult {
  left: BookmarkTree;
  right: BookmarkTree;
  applied: QueuedDiffOperation[];
  failed: Array<{ operation: QueuedDiffOperation; error: string }>;
  diffs?: DiffResult[];
  summary?: DiffSummary;
}

const createId = (() => {
  let counter = 0;
  return (prefix = "node") => {
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
  };
})();

const cloneNode = (node: BookmarkNode): BookmarkNode => ({
  ...node,
  path: [...node.path],
  children: node.children ? node.children.map(cloneNode) : undefined,
});

const cloneTree = (tree: BookmarkTree): BookmarkTree => ({
  rootId: tree.rootId,
  origin: tree.origin,
  nodes: tree.nodes.map(cloneNode),
});

const applyOriginAndPath = (
  node: BookmarkNode,
  parentPath: string[],
  origin: BookmarkSide | "merged"
): BookmarkNode => {
  const path = [...parentPath, node.title];
  const updated: BookmarkNode = {
    ...node,
    origin,
    path,
    children: node.children?.map((child) => applyOriginAndPath(child, path, origin)),
  };
  return updated;
};

const ensureFolderHierarchy = (
  nodes: BookmarkNode[],
  pathParts: string[],
  origin: BookmarkSide
): BookmarkNode[] => {
  let currentNodes = nodes;
  const walkingPath: string[] = [];

  for (const part of pathParts) {
    let folder = currentNodes.find((entry) => entry.title === part && entry.children);
    if (!folder) {
      folder = {
        id: createId("folder"),
        title: part,
        children: [],
        path: [...walkingPath, part],
        origin,
      };
      currentNodes.push(folder);
    }

    folder.path = [...walkingPath, folder.title];
    folder.origin = origin;
    if (!folder.children) folder.children = [];
    currentNodes = folder.children;
    walkingPath.push(part);
  }

  return currentNodes;
};

const removeNodeById = (nodes: BookmarkNode[], id?: string): boolean => {
  if (!id) return false;
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) {
    nodes.splice(index, 1);
    return true;
  }

  for (const node of nodes) {
    if (node.children && removeNodeById(node.children, id)) {
      if (node.children.length === 0) {
        delete node.children;
      }
      return true;
    }
  }
  return false;
};

const pruneEmptyFolders = (nodes: BookmarkNode[]): BookmarkNode[] => {
  return nodes
    .map((node) => {
      if (node.children) {
        const pruned = pruneEmptyFolders(node.children);
        if (pruned.length === 0) {
          const { children, ...rest } = node;
          return { ...rest } as BookmarkNode;
        }
        return { ...node, children: pruned };
      }
      return node;
    })
    .filter((node) => node.children !== undefined || node.url !== undefined);
};

const copyNodeToTarget = (
  sourceNode: BookmarkNode | undefined,
  targetTree: BookmarkTree,
  path: string[],
  origin: BookmarkSide
): void => {
  if (!sourceNode) return;
  const parentPath = path.slice(0, -1);
  const leafTitle = path[path.length - 1] ?? sourceNode.title;
  const targetNodes = ensureFolderHierarchy(targetTree.nodes, parentPath, origin);
  const cloned = applyOriginAndPath(cloneNode(sourceNode), parentPath, origin);
  cloned.title = leafTitle;
  cloned.path = [...parentPath, leafTitle];
  cloned.origin = origin;
  const existingIndex = targetNodes.findIndex((node) => node.title === leafTitle);
  if (existingIndex >= 0) {
    targetNodes.splice(existingIndex, 1, cloned);
  } else {
    targetNodes.push(cloned);
  }
};

const determineDeleteSide = (
  diff: DiffResult,
  defaultSide: BookmarkSide | undefined
): BookmarkSide => {
  if (diff.type === "added") return "right";
  if (diff.type === "deleted") return "left";
  return defaultSide ?? "right";
};

const handleAccept = (
  diff: DiffResult,
  leftTree: BookmarkTree,
  rightTree: BookmarkTree
) => {
  switch (diff.type) {
    case "added":
      copyNodeToTarget(diff.rightItem, leftTree, diff.path, "left");
      break;
    case "deleted":
      removeNodeById(leftTree.nodes, diff.leftItem?.id);
      break;
    case "modified":
      copyNodeToTarget(diff.rightItem, leftTree, diff.path, "left");
      break;
    case "duplicated":
      // 默认清理左侧重复
      if (diff.meta?.duplicatePaths) {
        const [, ...duplicates] = diff.meta.duplicatePaths;
        for (const path of duplicates) {
          const idToRemove = findNodeIdByPath(leftTree.nodes, path);
          removeNodeById(leftTree.nodes, idToRemove);
        }
      }
      break;
    default:
      break;
  }
};

export function applyOperations(
  params: {
    left: BookmarkTree;
    right: BookmarkTree;
    operations: QueuedDiffOperation[];
    options?: ApplyOperationsOptions;
  }
): ApplyOperationsResult {
  const { left, right, operations, options } = params;
  const leftClone = cloneTree(left);
  const rightClone = cloneTree(right);
  const applied: QueuedDiffOperation[] = [];
  const failed: Array<{ operation: QueuedDiffOperation; error: string }> = [];

  for (const operation of operations) {
    try {
      switch (operation.action) {
        case "copy-left-to-right":
          copyNodeToTarget(
            operation.diff.leftItem ?? operation.diff.rightItem,
            rightClone,
            operation.diff.path,
            "right"
          );
          applied.push(operation);
          break;
        case "copy-right-to-left":
          copyNodeToTarget(
            operation.diff.rightItem ?? operation.diff.leftItem,
            leftClone,
            operation.diff.path,
            "left"
          );
          applied.push(operation);
          break;
        case "delete": {
          const targetSide = operation.targetSide ?? options?.defaultTargetSide;
          const side = determineDeleteSide(operation.diff, targetSide);
          const targetNodes = side === "left" ? leftClone.nodes : rightClone.nodes;
          const id = side === "left" ? operation.diff.leftItem?.id : operation.diff.rightItem?.id;
          const removed = removeNodeById(targetNodes, id);
          if (!removed) {
            throw new Error("无法找到需要删除的节点");
          }
          applied.push(operation);
          break;
        }
        case "accept":
          handleAccept(operation.diff, leftClone, rightClone);
          applied.push(operation);
          break;
        case "resolve-duplicate": {
          const targetSide = operation.targetSide ?? options?.defaultTargetSide ?? "left";
          const paths = operation.diff.meta?.duplicatePaths ?? [];
          const [, ...toRemove] = paths;
          const targetNodes = targetSide === "left" ? leftClone.nodes : rightClone.nodes;
          for (const path of toRemove) {
            const id = findNodeIdByPath(targetNodes, path);
            if (id) {
              removeNodeById(targetNodes, id);
            }
          }
          applied.push(operation);
          break;
        }
        case "rename": {
          const targetSide = operation.targetSide ?? "right";
          const newTitle = String(operation.context?.newTitle ?? "").trim();
          if (!newTitle) {
            throw new Error("缺少新的名称");
          }
          const targetNodes = targetSide === "left" ? leftClone.nodes : rightClone.nodes;
          const id = targetSide === "left" ? operation.diff.leftItem?.id : operation.diff.rightItem?.id;
          if (!id) {
            throw new Error("无法定位需重命名的节点");
          }
          const renamed = renameNodeById(targetNodes, id, newTitle, targetSide);
          if (!renamed) {
            throw new Error("未找到需要重命名的节点");
          }
          applied.push(operation);
          break;
        }
        default:
          throw new Error(`未知操作: ${operation.action}`);
      }
    } catch (error) {
      failed.push({ operation, error: (error as Error).message });
    }
  }

  if (options?.cleanupEmptyFolders) {
    leftClone.nodes = pruneEmptyFolders(leftClone.nodes);
    rightClone.nodes = pruneEmptyFolders(rightClone.nodes);
  }

  let diffs: DiffResult[] | undefined;
  let summary: DiffSummary | undefined;
  if (options?.recomputeDiff) {
    const result: ComputeDiffPayload = computeDiff(
      leftClone,
      rightClone,
      options.diffOptions
    );
    diffs = result.diffs;
    summary = result.summary;
  }

  return {
    left: leftClone,
    right: rightClone,
    applied,
    failed,
    diffs,
    summary,
  };
}

const renameNodeById = (
  nodes: BookmarkNode[],
  id: string,
  newTitle: string,
  origin: BookmarkSide
): boolean => {
  for (const node of nodes) {
    if (node.id === id) {
      node.title = newTitle;
      node.path[node.path.length - 1] = newTitle;
      if (node.children) {
        node.children = node.children.map((child) => applyOriginAndPath(child, node.path, origin));
      }
      return true;
    }
    if (node.children && renameNodeById(node.children, id, newTitle, origin)) {
      return true;
    }
  }
  return false;
};

const findNodeIdByPath = (nodes: BookmarkNode[], path: string[]): string | undefined => {
  if (path.length === 0) return undefined;
  let currentNodes = nodes;
  let found: BookmarkNode | undefined;
  for (const segment of path) {
    found = currentNodes.find((node) => node.title === segment);
    if (!found) return undefined;
    currentNodes = found.children ?? [];
  }
  return found?.id;
};
