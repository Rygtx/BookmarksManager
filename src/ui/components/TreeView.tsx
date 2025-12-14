import { useEffect, useMemo, useState } from "react";
import type { BookmarkNode, DiffType } from "../../shared/types";

const PATH_SEPARATOR = " > ";

export interface HighlightEntry {
  type: DiffType;
  isActive?: boolean;
}

export type HighlightMap = Record<string, HighlightEntry>;

export interface TreeViewProps {
  title: string;
  nodes?: BookmarkNode[];
  highlightMap?: HighlightMap;
  placeholder?: string;
  side: "left" | "right";
  onSelectPath?: (path: string[]) => void;
  activePaths?: string[];
  autoExpandDepth?: number;
}

interface TreeNodeProps {
  node: BookmarkNode;
  level: number;
  highlightMap?: HighlightMap;
  onSelect?: (path: string[]) => void;
  activePaths?: string[];
  autoExpandDepth?: number;
}

const NodeIcon = ({ node }: { node: BookmarkNode }) => {
  const className =
    node.children && node.children.length > 0
      ? "tree-node__icon tree-node__icon--folder"
      : "tree-node__icon tree-node__icon--item";
  return <span className={className} aria-hidden />;
};

const TreeNode = ({
  node,
  level,
  highlightMap,
  onSelect,
  activePaths,
  autoExpandDepth = 1,
}: TreeNodeProps) => {
  const hasChildren = Boolean(node.children && node.children.length);
  const pathKey = useMemo(() => node.path.join(PATH_SEPARATOR), [node.path]);
  const highlight = highlightMap?.[pathKey];

  const classNames = ["tree-node"];
  if (highlight) {
    classNames.push(`tree-node--${highlight.type}`);
    if (highlight.isActive) {
      classNames.push("tree-node--active");
    }
  }

  const shouldExpand =
    hasChildren &&
    (level < autoExpandDepth ||
      activePaths?.some((path) => path.startsWith(pathKey)));

  const [expanded, setExpanded] = useState<boolean>(shouldExpand);

  useEffect(() => {
    if (shouldExpand) {
      setExpanded(true);
    }
  }, [shouldExpand]);

  const handleToggle = () => {
    if (!hasChildren) return;
    setExpanded((prev) => !prev);
  };

  const handleSelect = () => {
    onSelect?.(node.path);
  };

  return (
    <li className={classNames.join(" ")} data-path={pathKey}>
      <div className="tree-node__content">
        {hasChildren ? (
          <button
            type="button"
            className="tree-node__toggle"
            onClick={handleToggle}
            aria-label={expanded ? "折叠" : "展开"}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="tree-node__spacer" />
        )}
        <button
          type="button"
          className="tree-node__label"
          onClick={handleSelect}
        >
          <NodeIcon node={node} />
          <span className="tree-node__title">{node.title}</span>
          {node.url && (
            <span className="tree-node__url" title={node.url}>
              {node.url}
            </span>
          )}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul className="tree-node__children">
          {node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              highlightMap={highlightMap}
              onSelect={onSelect}
              activePaths={activePaths}
              autoExpandDepth={autoExpandDepth}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const TreeView = ({
  title,
  nodes,
  highlightMap,
  placeholder = "尚未加载书签",
  side,
  onSelectPath,
  activePaths,
  autoExpandDepth = 1,
}: TreeViewProps) => {
  const renderNodes = () => {
    if (!nodes || nodes.length === 0) {
      return <div className="tree-view__empty">{placeholder}</div>;
    }

    return (
      <ul className="tree-view__tree">
        {nodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            level={0}
            highlightMap={highlightMap}
            onSelect={onSelectPath}
            activePaths={activePaths}
            autoExpandDepth={autoExpandDepth}
          />
        ))}
      </ul>
    );
  };

  return (
    <section
      className="tree-view"
      data-side={side}
      aria-label={`${side === "left" ? "左侧" : "右侧"}书签树`}
    >
      <header className="tree-view__header">
        <h2>{title}</h2>
        <span className="tree-view__count">{nodes?.length ?? 0}</span>
      </header>
      <div className="tree-view__body">{renderNodes()}</div>
    </section>
  );
};
