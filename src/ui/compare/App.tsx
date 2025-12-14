import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BookmarkImportPayload,
  BookmarkSide,
  BookmarkTree,
  DiffResult,
} from "../../shared/types";
import { computeDiff } from "../../shared/diff";
import { parseHtmlBookmarks, parseJsonBookmarks } from "../../shared/parser";
import { TreeView, type HighlightMap } from "../components/TreeView";
import { DiffPanel } from "../components/DiffPanel";
import { useDiffNavigator } from "../hooks/useDiffNavigator";
import { createMockTrees } from "./mockData";
import { requestImportFile, requestReadBrowserBookmarks, runtimeAvailable } from "../utils/runtime";

const PATH_SEPARATOR = " > ";

interface HighlightMaps {
  left: HighlightMap;
  right: HighlightMap;
}

type StatusLevel = "info" | "success" | "error";

const aggregatePathsForSide = (diff: DiffResult | undefined, side: BookmarkSide): string[] => {
  if (!diff) return [];
  const paths: string[] = [];
  if (side === "left") {
    if (diff.leftItem?.path) {
      paths.push(diff.leftItem.path.join(PATH_SEPARATOR));
    }
  } else if (diff.rightItem?.path) {
    paths.push(diff.rightItem.path.join(PATH_SEPARATOR));
  }
  if (diff.meta?.duplicatePaths?.length) {
    diff.meta.duplicatePaths.forEach((path) => {
      paths.push(path.join(PATH_SEPARATOR));
    });
  }
  return Array.from(new Set(paths));
};

const buildHighlightMaps = (
  diffs: DiffResult[],
  activeDiff?: DiffResult
): HighlightMaps => {
  const left: HighlightMap = {};
  const right: HighlightMap = {};

  const markPath = (
    map: HighlightMap,
    path: string[] | undefined,
    type: DiffResult["type"],
    isActive: boolean
  ) => {
    if (!path) return;
    const key = path.join(PATH_SEPARATOR);
    map[key] = {
      type,
      isActive: Boolean(isActive),
    };
  };

  diffs.forEach((diff) => {
    const isActive = diff === activeDiff;
    markPath(left, diff.leftItem?.path, diff.type, isActive);
    markPath(right, diff.rightItem?.path, diff.type, isActive);

    if (diff.meta?.duplicatePaths) {
      diff.meta.duplicatePaths.forEach((path) => {
        markPath(left, path, "duplicated", isActive);
        markPath(right, path, "duplicated", isActive);
      });
    }
  });

  return { left, right };
};

const emptySummary = {
  added: 0,
  deleted: 0,
  modified: 0,
  duplicated: 0,
  total: 0,
};

export function App() {
  const [leftTree, setLeftTree] = useState<BookmarkTree | null>(null);
  const [rightTree, setRightTree] = useState<BookmarkTree | null>(null);
  const [diffs, setDiffs] = useState<DiffResult[]>([]);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [loadingSide, setLoadingSide] = useState<BookmarkSide | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusLevel, setStatusLevel] = useState<StatusLevel>("info");

  const leftInputRef = useRef<HTMLInputElement | null>(null);
  const rightInputRef = useRef<HTMLInputElement | null>(null);
  const lastScrollToken = useRef<string | null>(null);

  const {
    filteredDiffs,
    activeDiff,
    activeIndex,
    summary,
    filter,
    setFilter,
    selectDiff,
    goNext,
    goPrevious,
  } = useDiffNavigator(diffs);

  useEffect(() => {
    if (!leftTree || !rightTree) {
      setDiffs([]);
      return;
    }
    const result = computeDiff(leftTree, rightTree, {
      includeDuplicates: true,
      compareBy: "both",
    });
    setDiffs(result.diffs);
  }, [leftTree, rightTree]);

  const highlights = useMemo(
    () => buildHighlightMaps(diffs, activeDiff),
    [diffs, activeDiff]
  );
  const activePathsLeft = useMemo(
    () => aggregatePathsForSide(activeDiff, "left"),
    [activeDiff]
  );
  const activePathsRight = useMemo(
    () => aggregatePathsForSide(activeDiff, "right"),
    [activeDiff]
  );

  const setStatus = (message: string, level: StatusLevel = "info") => {
    setStatusMessage(message);
    setStatusLevel(level);
  };

  const resetStatus = () => {
    setStatusMessage(null);
    setStatusLevel("info");
  };

  const handleImportResult = (tree: BookmarkTree, side: BookmarkSide) => {
    if (side === "left") {
      setLeftTree(tree);
    } else {
      setRightTree(tree);
    }
  };

  const parseLocally = async (
    payload: BookmarkImportPayload
  ): Promise<BookmarkTree> => {
    const { file, content, side } = payload;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".json")) {
      return parseJsonBookmarks(content, {
        origin: side,
        rootId: `${side}-local-${Date.now()}`,
      });
    }
    return parseHtmlBookmarks(content, {
      origin: side,
      rootId: `${side}-local-${Date.now()}`,
    });
  };

  const handleFileImport = async (side: BookmarkSide, file: File) => {
    setLoadingSide(side);
    try {
      const content = await file.text();
      const payload: BookmarkImportPayload = {
        side,
        content,
        file: {
          name: file.name,
          size: file.size,
          mimeType: file.type,
          lastModified: file.lastModified,
        },
      };

      if (runtimeAvailable()) {
        const response = await requestImportFile(payload);
        if (response.payload?.tree) {
          handleImportResult(response.payload.tree, side);
          setStatus(
            `${side === "left" ? "左侧" : "右侧"}书签已从「${file.name}」导入。`,
            "success"
          );
        } else {
          throw new Error("扩展返回的书签数据为空");
        }
      } else {
        const tree = await parseLocally(payload);
        handleImportResult(tree, side);
        setStatus(
          `${side === "left" ? "左侧" : "右侧"}书签已在本地解析（未连接扩展运行环境）。`,
          "info"
        );
      }
    } catch (error) {
      console.error("导入书签失败", error);
      setStatus(
        `${side === "left" ? "左侧" : "右侧"}导入失败：${
          (error as Error).message ?? "未知错误"
        }`,
        "error"
      );
    } finally {
      setLoadingSide(null);
    }
  };

  const handleReadBrowser = async (side: BookmarkSide) => {
    if (!runtimeAvailable()) {
      setStatus(
        "当前页面未运行在扩展环境中，无法直接读取浏览器书签。",
        "error"
      );
      return;
    }
    setLoadingSide(side);
    try {
      const response = await requestReadBrowserBookmarks(side);
      if (response.payload?.tree) {
        handleImportResult(response.payload.tree, side);
        setStatus(
          `${side === "left" ? "左侧" : "右侧"}已读取浏览器书签。`,
          "success"
        );
      } else {
        throw new Error("浏览器返回空书签树");
      }
    } catch (error) {
      console.error("读取浏览器书签失败", error);
      setStatus(
        `${side === "left" ? "左侧" : "右侧"}读取失败：${
          (error as Error).message ?? "未知错误"
        }`,
        "error"
      );
    } finally {
      setLoadingSide(null);
    }
  };

  const handleLoadMock = () => {
    const { left, right } = createMockTrees();
    setLeftTree(left);
    setRightTree(right);
    setStatus("已载入示例数据。", "info");
  };

  const handleReset = () => {
    setLeftTree(null);
    setRightTree(null);
    setDiffs([]);
    resetStatus();
  };

  const summaryToRender = summary ?? emptySummary;

  const handleSelectDiffFromTree = (path: string[]) => {
    const key = path.join(PATH_SEPARATOR);
    const index = diffs.findIndex((diff) => {
      const candidates: string[] = [];
      if (diff.leftItem?.path)
        candidates.push(diff.leftItem.path.join(PATH_SEPARATOR));
      if (diff.rightItem?.path)
        candidates.push(diff.rightItem.path.join(PATH_SEPARATOR));
      if (diff.meta?.duplicatePaths) {
        diff.meta.duplicatePaths.forEach((p) =>
          candidates.push(p.join(PATH_SEPARATOR))
        );
      }
      return candidates.includes(key);
    });
    if (index >= 0) {
      if (filter === "all") {
        selectDiff(index);
      } else {
        const filteredIndex = filteredDiffs.findIndex(
          (diff) => diff === diffs[index]
        );
        if (filteredIndex >= 0) {
          selectDiff(filteredIndex);
        } else {
          setPendingIndex(index);
          setFilter("all");
        }
      }
    }
  };

  useEffect(() => {
    if (pendingIndex === null) return;
    if (filter !== "all") return;
    if (!diffs[pendingIndex]) {
      setPendingIndex(null);
      return;
    }
    selectDiff(pendingIndex);
    setPendingIndex(null);
  }, [pendingIndex, filter, diffs, selectDiff]);

  useEffect(() => {
    const scrollPaths = (side: BookmarkSide, paths: string[]) => {
      if (!paths.length) return;
      const container = document.querySelector<HTMLElement>(
        `.tree-view[data-side="${side}"] .tree-view__body`
      );
      if (!container) return;
      for (const path of paths) {
        const node = Array.from(container.querySelectorAll<HTMLElement>(".tree-node")).find(
          (item) => item.dataset.path === path
        );
        if (node) {
          node.scrollIntoView({ block: "center", behavior: "smooth" });
          const label = node.querySelector<HTMLButtonElement>(".tree-node__label");
          label?.focus({ preventScroll: true });
          break;
        }
      }
    };

    const token =
      activeDiff?.type +
      ":" +
      (activePathsLeft[0] ?? "") +
      ":" +
      (activePathsRight[0] ?? "");

    if (token && token !== lastScrollToken.current) {
      scrollPaths("left", activePathsLeft);
      scrollPaths("right", activePathsRight);
      lastScrollToken.current = token;
    }
  }, [activeDiff, activePathsLeft, activePathsRight]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!filteredDiffs.length) return;
      if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        goNext();
      } else if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        goPrevious();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredDiffs.length, goNext, goPrevious]);

  return (
    <div className="compare-app">
      <header className="compare-app__header">
        <div>
          <h1>书签对比助手</h1>
          <p>导入两份书签即可查看差异。当前展示为示例数据，便于预览界面。</p>
        </div>
        <div className="compare-app__controls">
          <div className="compare-app__imports">
            <div className="import-group">
              <span className="import-group__label">左侧数据</span>
              <button
                type="button"
                onClick={() => leftInputRef.current?.click()}
                disabled={loadingSide === "left"}
              >
                {loadingSide === "left" ? "正在导入…" : "导入文件"}
              </button>
              <button
                type="button"
                onClick={() => void handleReadBrowser("left")}
                disabled={loadingSide === "left"}
              >
                读取浏览器
              </button>
            </div>
            <div className="import-group">
              <span className="import-group__label">右侧数据</span>
              <button
                type="button"
                onClick={() => rightInputRef.current?.click()}
                disabled={loadingSide === "right"}
              >
                {loadingSide === "right" ? "正在导入…" : "导入文件"}
              </button>
              <button
                type="button"
                onClick={() => void handleReadBrowser("right")}
                disabled={loadingSide === "right"}
              >
                读取浏览器
              </button>
            </div>
          </div>
          <div className="compare-app__actions">
            <button type="button" onClick={handleLoadMock}>
              载入示例数据
            </button>
            <button type="button" onClick={handleReset}>
              清空
            </button>
            <button
              type="button"
              onClick={goPrevious}
              disabled={!filteredDiffs.length}
            >
              上一个差异
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!filteredDiffs.length}
            >
              下一个差异
            </button>
          </div>
        </div>
        <input
          ref={leftInputRef}
          type="file"
          accept=".html,.htm,.json"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              void handleFileImport("left", file);
            }
          }}
        />
        <input
          ref={rightInputRef}
          type="file"
          accept=".html,.htm,.json"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              void handleFileImport("right", file);
            }
          }}
        />
        {statusMessage && (
          <div className={`compare-app__status status--${statusLevel}`}>
            {statusMessage}
          </div>
        )}
      </header>

      <section className="compare-app__main">
        <div className="compare-app__trees">
          <TreeView
            title="左侧书签"
            nodes={leftTree?.nodes}
            highlightMap={highlights.left}
            side="left"
            placeholder="尚未导入左侧数据"
            onSelectPath={handleSelectDiffFromTree}
            activePaths={activePathsLeft}
            autoExpandDepth={1}
          />
          <TreeView
            title="右侧书签"
            nodes={rightTree?.nodes}
            highlightMap={highlights.right}
            side="right"
            placeholder="尚未导入右侧数据"
            onSelectPath={handleSelectDiffFromTree}
            activePaths={activePathsRight}
            autoExpandDepth={1}
          />
        </div>
        <DiffPanel
          summary={summaryToRender}
          diffs={filteredDiffs}
          activeIndex={activeIndex}
          filter={filter}
          onFilterChange={setFilter}
          onSelectDiff={selectDiff}
        />
      </section>

      <footer className="compare-app__footer">
        <span>
          {diffs.length
            ? `共检测到 ${diffs.length} 条差异`
            : "尚未开始比较，请导入数据或加载示例。"}
        </span>
        {activeDiff && (
          <span className="compare-app__active-diff">
            当前差异：{activeDiff.changeSummary}（Alt+↑/Alt+↓ 快速浏览）
          </span>
        )}
      </footer>
    </div>
  );
}
