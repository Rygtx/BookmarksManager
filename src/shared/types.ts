export type BookmarkSide = "left" | "right";

export type BookmarkOrigin = BookmarkSide | "merged";

export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkNode[];
  path: string[];
  origin: BookmarkOrigin;
  createdAt?: number;
  icon?: string;
  description?: string;
}

export interface BookmarkTree {
  /** 唯一标识，通常对应根目录 ID */
  rootId: string;
  /** 根节点下的一级目录/书签集合 */
  nodes: BookmarkNode[];
  /** 数据来源，区分左右两侧或合并结果 */
  origin: BookmarkOrigin;
}

export type DiffType = "added" | "deleted" | "modified" | "duplicated";

export interface DiffOperation {
  action:
    | "copy-left-to-right"
    | "copy-right-to-left"
    | "delete"
    | "accept"
    | "rename"
    | "resolve-duplicate";
  label: string;
  confirm?: boolean;
  tooltip?: string;
}

export interface DiffResult {
  type: DiffType;
  path: string[];
  leftItem?: BookmarkNode;
  rightItem?: BookmarkNode;
  /** 对差异的简要描述，用于差异面板 */
  changeSummary: string;
  operations: DiffOperation[];
  meta?: {
    severity?: "info" | "warning" | "critical";
    duplicatePaths?: string[][];
  };
}

export interface DiffOptions {
  includeDuplicates?: boolean;
  compareBy?: "title" | "url" | "both";
  caseSensitive?: boolean;
  trimWhitespace?: boolean;
}

export interface DiffSummary {
  added: number;
  deleted: number;
  modified: number;
  duplicated: number;
  total: number;
}

export type BookmarkFileFormat =
  | "chrome-html"
  | "firefox-html"
  | "chrome-json"
  | "generic-json";

export interface ImportFileDescriptor {
  name: string;
  size: number;
  mimeType?: string;
  lastModified?: number;
  format?: BookmarkFileFormat;
}

export interface BookmarkImportPayload {
  side: BookmarkSide;
  file: ImportFileDescriptor;
  content: string;
}

export interface BookmarkReadOptions {
  includeFavicons?: boolean;
  maxDepth?: number;
}

export interface ExportOptions {
  format: BookmarkFileFormat;
  fileName?: string;
  pretty?: boolean;
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  diffView: "combined" | "split";
  expandByDefault: boolean;
  showFavicons: boolean;
  lastUsedFormat?: BookmarkFileFormat;
}

export interface RuntimeErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  recoverable?: boolean;
}
export interface QueuedDiffOperation {
  diff: DiffResult;
  action: DiffOperation["action"];
  targetSide?: BookmarkSide;
  /** 额外上下文信息，如用户选择的新名称或目标路径 */
  context?: Record<string, unknown>;
}
