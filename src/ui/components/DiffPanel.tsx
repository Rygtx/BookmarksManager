import type { DiffResult } from "../../shared/types";
import type { DiffFilter } from "../hooks/useDiffNavigator";

export interface DiffPanelProps {
  summary: {
    added: number;
    deleted: number;
    modified: number;
    duplicated: number;
    total: number;
  };
  diffs: DiffResult[];
  activeIndex: number;
  filter: DiffFilter;
  onFilterChange: (filter: DiffFilter) => void;
  onSelectDiff: (index: number) => void;
}

const FILTER_LABEL_MAP: Record<DiffFilter, string> = {
  all: "全部",
  added: "新增",
  deleted: "删除",
  modified: "修改",
  duplicated: "重复",
};

export const DiffPanel = ({
  summary,
  diffs,
  activeIndex,
  filter,
  onFilterChange,
  onSelectDiff,
}: DiffPanelProps) => {
  const renderFilters = () => {
    const filters: DiffFilter[] = ["all", "added", "deleted", "modified", "duplicated"];
    return filters.map((item) => (
      <button
        key={item}
        type="button"
        className={`diff-panel__filter ${filter === item ? "is-active" : ""}`}
        onClick={() => onFilterChange(item)}
      >
        <span>{FILTER_LABEL_MAP[item]}</span>
        <span className="diff-panel__filter-count">
          {item === "all" ? summary.total : summary[item]}
        </span>
      </button>
    ));
  };

  const renderDiffList = () => {
    if (!diffs.length) {
      return <div className="diff-panel__empty">暂无差异</div>;
    }

    return (
      <ul className="diff-panel__list">
        {diffs.map((diff, index) => (
          <li
            key={`${diff.type}-${diff.path.join("-")}-${index}`}
            className={`diff-panel__item diff-panel__item--${diff.type} ${
              index === activeIndex ? "is-active" : ""
            }`}
          >
            <button type="button" onClick={() => onSelectDiff(index)}>
              <span className="diff-panel__badge">{FILTER_LABEL_MAP[diff.type]}</span>
              <span className="diff-panel__title">{diff.changeSummary}</span>
              <span className="diff-panel__path" title={diff.path.join(" / ")}>
                {diff.path.join(" / ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <aside className="diff-panel">
      <header className="diff-panel__header">
        <h2>差异统计</h2>
        <div className="diff-panel__filters">{renderFilters()}</div>
      </header>
      <div className="diff-panel__body">{renderDiffList()}</div>
    </aside>
  );
};
