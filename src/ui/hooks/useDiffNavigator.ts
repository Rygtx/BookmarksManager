import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiffResult, DiffSummary, DiffType } from "../../shared/types";

export type DiffFilter = DiffType | "all";

export interface DiffNavigatorState {
  filteredDiffs: DiffResult[];
  activeDiff?: DiffResult;
  activeIndex: number;
  filter: DiffFilter;
  summary: DiffSummary;
  setFilter: (filter: DiffFilter) => void;
  selectDiff: (index: number) => void;
  goNext: () => void;
  goPrevious: () => void;
}

const emptySummary: DiffSummary = {
  added: 0,
  deleted: 0,
  modified: 0,
  duplicated: 0,
  total: 0,
};

const deriveSummary = (diffs: DiffResult[]): DiffSummary => {
  return diffs.reduce<DiffSummary>((acc, diff) => {
    switch (diff.type) {
      case "added":
        acc.added += 1;
        break;
      case "deleted":
        acc.deleted += 1;
        break;
      case "modified":
        acc.modified += 1;
        break;
      case "duplicated":
        acc.duplicated += 1;
        break;
      default:
        break;
    }
    acc.total += 1;
    return acc;
  }, { ...emptySummary });
};

export function useDiffNavigator(diffs: DiffResult[]): DiffNavigatorState {
  const [filter, setFilter] = useState<DiffFilter>("all");

  const filteredDiffs = useMemo(() => {
    if (filter === "all") return diffs;
    return diffs.filter((diff) => diff.type === filter);
  }, [diffs, filter]);

  const summary = useMemo(() => deriveSummary(diffs), [diffs]);

  const [activeIndex, setActiveIndex] = useState<number>(filteredDiffs.length ? 0 : -1);

  useEffect(() => {
    if (!filteredDiffs.length) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((prev) => {
      if (prev === -1) return 0;
      if (prev >= filteredDiffs.length) return filteredDiffs.length - 1;
      return prev;
    });
  }, [filteredDiffs]);

  const selectDiff = useCallback((index: number) => {
    if (!filteredDiffs.length) return;
    const safeIndex = Math.max(0, Math.min(index, filteredDiffs.length - 1));
    setActiveIndex(safeIndex);
  }, [filteredDiffs.length]);

  const goNext = useCallback(() => {
    if (!filteredDiffs.length) return;
    setActiveIndex((prev) => {
      if (prev === -1) return 0;
      return (prev + 1) % filteredDiffs.length;
    });
  }, [filteredDiffs.length]);

  const goPrevious = useCallback(() => {
    if (!filteredDiffs.length) return;
    setActiveIndex((prev) => {
      if (prev === -1) return filteredDiffs.length - 1;
      return prev - 1 < 0 ? filteredDiffs.length - 1 : prev - 1;
    });
  }, [filteredDiffs.length]);

  const activeDiff = activeIndex >= 0 ? filteredDiffs[activeIndex] : undefined;

  return {
    filteredDiffs,
    activeDiff,
    activeIndex,
    filter,
    summary,
    setFilter,
    selectDiff,
    goNext,
    goPrevious,
  };
}
