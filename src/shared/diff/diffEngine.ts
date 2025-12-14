import type {
  BookmarkNode,
  BookmarkTree,
  DiffOptions,
  DiffResult,
  DiffSummary,
  DiffType
} from "../types";

export interface ComputeDiffOptions extends DiffOptions {
  ignoreCase?: boolean;
}

export interface ComputeDiffPayload {
  diffs: DiffResult[];
  summary: DiffSummary;
}

interface FlattenedNode {
  node: BookmarkNode;
  isFolder: boolean;
  pathKey: string;
}

const PATH_SEPARATOR = " > ";

const normalise = (value: string, ignoreCase: boolean): string => {
  const trimmed = value.trim();
  return ignoreCase ? trimmed.toLowerCase() : trimmed;
};

const buildPathKey = (path: string[]): string => path.join(PATH_SEPARATOR);

const cloneNode = (node: BookmarkNode): BookmarkNode => ({
  ...node,
  path: [...node.path],
  children: node.children ? node.children.map(cloneNode) : undefined,
});

const flattenTree = (tree: BookmarkTree, ignoreCase: boolean): FlattenedNode[] => {
  const entries: FlattenedNode[] = [];

  const visit = (node: BookmarkNode) => {
    const isFolder = Array.isArray(node.children) && node.children.length >= 0;
    const normalisedPath = node.path.map((segment) => normalise(segment, ignoreCase));
    entries.push({
      node,
      isFolder,
      pathKey: buildPathKey(normalisedPath),
    });
    node.children?.forEach(visit);
  };

  tree.nodes.forEach(visit);
  return entries;
};

const collectDuplicates = (
  nodes: FlattenedNode[],
  ignoreCase: boolean
): DiffResult[] => {
  const urlMap = new Map<string, BookmarkNode[]>();

  for (const entry of nodes) {
    const { node } = entry;
    if (!node.url) continue;
    const key = normalise(node.url, ignoreCase);
    const list = urlMap.get(key) ?? [];
    list.push(node);
    urlMap.set(key, list);
  }

  const diffs: DiffResult[] = [];
  for (const [url, list] of urlMap) {
    if (list.length <= 1) continue;
    diffs.push({
      type: "duplicated",
      path: list[0].path,
      changeSummary: `检测到 ${list.length} 个重复条目`,
      operations: [
        {
          action: "resolve-duplicate",
          label: "清理重复",
          confirm: true,
        },
      ],
      meta: {
        severity: "warning",
        duplicatePaths: list.map((item) => item.path),
      },
      leftItem: list[0],
      rightItem: undefined,
    });
  }
  return diffs;
};

const buildSummary = (diffs: DiffResult[]): DiffSummary => {
  let added = 0;
  let deleted = 0;
  let modified = 0;
  let duplicated = 0;
  for (const diff of diffs) {
    switch (diff.type) {
      case "added":
        added += 1;
        break;
      case "deleted":
        deleted += 1;
        break;
      case "modified":
        modified += 1;
        break;
      case "duplicated":
        duplicated += 1;
        break;
      default:
        break;
    }
  }
  const total = added + deleted + modified + duplicated;
  return { added, deleted, modified, duplicated, total };
};

const isSameNode = (
  left: BookmarkNode | undefined,
  right: BookmarkNode | undefined,
  options: { compareBy: DiffOptions["compareBy"]; ignoreCase: boolean }
): boolean => {
  if (!left || !right) return false;
  const compareBy = options.compareBy ?? "both";
  const ignoreCase = options.ignoreCase;

  const normaliseText = (value: string | undefined): string =>
    value ? normalise(value, ignoreCase) : "";

  switch (compareBy) {
    case "title":
      return normaliseText(left.title) === normaliseText(right.title);
    case "url":
      return normaliseText(left.url) === normaliseText(right.url);
    case "both":
    default:
      return (
        normaliseText(left.title) === normaliseText(right.title) &&
        normaliseText(left.url) === normaliseText(right.url)
      );
  }
};

const describeModification = (
  left: BookmarkNode,
  right: BookmarkNode
): string => {
  const changes: string[] = [];
  if ((left.url ?? "") !== (right.url ?? "")) {
    changes.push("URL 发生变化");
  }
  if (left.title !== right.title) {
    changes.push("标题已更新");
  }
  if (changes.length === 0) {
    changes.push("节点内容已调整");
  }
  return changes.join("，");
};

const buildModificationOperations = (): DiffResult["operations"] => [
  {
    action: "copy-left-to-right",
    label: "以左侧为准",
  },
  {
    action: "copy-right-to-left",
    label: "以右侧为准",
  },
  {
    action: "accept",
    label: "接受右侧修改",
  },
];

export function computeDiff(
  left: BookmarkTree,
  right: BookmarkTree,
  options: ComputeDiffOptions = {}
): ComputeDiffPayload {
  const ignoreCase = options.ignoreCase ?? !options.caseSensitive;

  const leftEntries = flattenTree(left, ignoreCase);
  const rightEntries = flattenTree(right, ignoreCase);
  const leftMap = new Map<string, FlattenedNode>();
  const rightMap = new Map<string, FlattenedNode>();

  leftEntries.forEach((entry) => leftMap.set(entry.pathKey, entry));
  rightEntries.forEach((entry) => rightMap.set(entry.pathKey, entry));

  const diffs: DiffResult[] = [];

  // Collect modifications and deletions
  for (const [pathKey, leftEntry] of leftMap) {
    const rightEntry = rightMap.get(pathKey);
    if (rightEntry) {
      const leftNode = leftEntry.node;
      const rightNode = rightEntry.node;
      const same = isSameNode(leftNode, rightNode, {
        compareBy: options.compareBy,
        ignoreCase,
      });
      if (!same) {
        diffs.push({
          type: "modified",
          path: rightNode.path,
          leftItem: cloneNode(leftNode),
          rightItem: cloneNode(rightNode),
          changeSummary: describeModification(leftNode, rightNode),
          operations: buildModificationOperations(),
        });
      }
    } else {
      const node = leftEntry.node;
      diffs.push({
        type: "deleted",
        path: node.path,
        leftItem: cloneNode(node),
        changeSummary: "仅存在于左侧",
        operations: [
          {
            action: "copy-left-to-right",
            label: "复制到右侧",
          },
          {
            action: "delete",
            label: "保留删除",
            confirm: true,
          },
        ],
      });
    }
  }

  // Collect additions
  for (const [pathKey, rightEntry] of rightMap) {
    if (leftMap.has(pathKey)) continue;
    const node = rightEntry.node;
    diffs.push({
      type: "added",
      path: node.path,
      rightItem: cloneNode(node),
      changeSummary: "仅存在于右侧",
      operations: [
        {
          action: "copy-right-to-left",
          label: "复制到左侧",
        },
        {
          action: "delete",
          label: "忽略新增",
          confirm: true,
        },
      ],
    });
  }

  if (options.includeDuplicates) {
    diffs.push(...collectDuplicates(leftEntries, ignoreCase));
    diffs.push(...collectDuplicates(rightEntries, ignoreCase));
  }

  const summary = buildSummary(diffs);
  return { diffs, summary };
}
