# 书签对比助手

一个用于在两份书签数据之间进行差异比对与整理的 Chrome 浏览器扩展。

## 功能特性

- 📊 **差异检测** - 自动比对两份书签，识别新增、删除、修改和重复项
- 🔄 **智能合并** - 支持多种合并策略
- 📁 **多格式支持** - 支持导入/导出 HTML、JSON 格式的书签
- 🎨 **友好界面** - React + TypeScript 构建的现代化 UI
- 💾 **浏览器集成** - 直接读取 Chrome 浏览器书签

## 界面预览

![Extension UI](docs/screenshots/extension-ui.png)

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 7
- **扩展框架**: Chrome Extension (Manifest V3)
- **项目构建**: CRXJS Vite Plugin

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发

```bash
npm run dev
```

### 构建

```bash
npm run build
```

生成的扩展文件在 `dist/` 目录下。

### 在 Chrome 中加载

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用 **开发者模式**（右上角开关）
3. 点击 **加载已解压的扩展程序**
4. 选择项目中的 `dist` 文件夹

## 项目结构

```
src/
├── background/
│   └── serviceWorker.ts      # Service Worker 后台脚本
├── shared/
│   ├── diff/                 # 差异对比引擎
│   ├── parser/               # 书签解析器（HTML/JSON）
│   ├── exporter/             # 书签导出器
│   ├── messages.ts           # 消息通信协议
│   └── types.ts              # TypeScript 类型定义
└── ui/
    └── compare/              # 对比界面
```

## 许可证

MIT
