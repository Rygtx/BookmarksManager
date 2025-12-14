import type { BookmarkTree } from "../../shared/types";

export interface MockDataSet {
  left: BookmarkTree;
  right: BookmarkTree;
}

export const createMockTrees = (): MockDataSet => {
  const left: BookmarkTree = {
    rootId: "left-root",
    origin: "left",
    nodes: [
      {
        id: "left-folder-dev",
        title: "开发资源",
        origin: "left",
        path: ["开发资源"],
        children: [
          {
            id: "left-mdn",
            title: "MDN Web Docs",
            url: "https://developer.mozilla.org/",
            origin: "left",
            path: ["开发资源", "MDN Web Docs"],
          },
          {
            id: "left-github",
            title: "GitHub",
            url: "https://github.com/",
            origin: "left",
            path: ["开发资源", "GitHub"],
          },
        ],
      },
      {
        id: "left-folder-life",
        title: "生活",
        origin: "left",
        path: ["生活"],
        children: [
          {
            id: "left-recipes",
            title: "家常菜",
            url: "https://recipes.example.com/",
            origin: "left",
            path: ["生活", "家常菜"],
          },
        ],
      },
    ],
  };

  const right: BookmarkTree = {
    rootId: "right-root",
    origin: "right",
    nodes: [
      {
        id: "right-folder-dev",
        title: "开发资源",
        origin: "right",
        path: ["开发资源"],
        children: [
          {
            id: "right-mdn",
            title: "MDN Web Docs",
            url: "https://developer.mozilla.org/zh-CN/",
            origin: "right",
            path: ["开发资源", "MDN Web Docs"],
          },
          {
            id: "right-stackoverflow",
            title: "Stack Overflow",
            url: "https://stackoverflow.com/",
            origin: "right",
            path: ["开发资源", "Stack Overflow"],
          },
        ],
      },
      {
        id: "right-folder-life",
        title: "兴趣",
        origin: "right",
        path: ["兴趣"],
        children: [
          {
            id: "right-recipes",
            title: "家常菜",
            url: "https://recipes.example.com/",
            origin: "right",
            path: ["兴趣", "家常菜"],
          },
          {
            id: "right-travel",
            title: "旅行计划",
            url: "https://travel.example.com/",
            origin: "right",
            path: ["兴趣", "旅行计划"],
          },
        ],
      },
    ],
  };

  return { left, right };
};
