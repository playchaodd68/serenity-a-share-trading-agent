# Serenity Research Panel

Serenity A 股研究工作台前端（React 18 + Vite 5 + Tailwind 3 + ECharts 5 + TanStack Query 5）。
数据层 100% 对接本项目真实工件（`reports/`、`runs/`、`data/`），面板对数据**只读**，任何写操作只经由 `/chat`。

## 开发

```bash
# 终端 A：panel-server（8788，/api/* + /chat + 生产静态托管）
npm run panel:server

# 终端 B：Vite 开发服务器（5178，/api 与 /chat 代理到 8788）
npm run panel:dev
```

## 构建

```bash
npm --prefix panel run build     # tsc --noEmit && vite build → panel/dist
npm --prefix panel run typecheck # 仅类型检查
```

设计蓝图（token 总表、页面架构、API 契约）见项目内部设计文档；`src/styles/tokens.css` 是设计 token 的单一事实来源。

## 来源与许可（Attribution）

本面板的部分组件与模式**近似照搬**自 tickflow-stock-panel（MIT License），相关文件头均注明 `Adapted from tickflow-stock-panel (MIT)`：

| 本项目文件 | 借鉴来源 | 借鉴内容 |
|---|---|---|
| `src/styles/tokens.css` + `tailwind.config.ts` | `src/index.css`、`tailwind.config.ts` | 语义色 token 架构（bull/bear 与 UI 状态色分离）、分层圆角（4/6/8/12）、smooth 缓动、`.num` 等宽数字工具类、细滚动条 |
| `src/components/shell/Layout.tsx`、`Sidebar.tsx` | `src/components/Layout.tsx` | 终端壳网格、侧边栏品牌块/导航激活态/底部状态区三段式 |
| `src/components/shell/PageHeader.tsx` | `src/components/PageHeader.tsx` | title/subtitle/right 三槽页头 |
| `src/components/ui/SectionTitle.tsx` | `Dashboard.tsx` 内 `SectionTitle` | 图标+小标题+右侧 mono hint 小节样式 |
| `src/components/ui/Toast.tsx` | `src/components/Toast.tsx` | 模块级单例队列 + 订阅式容器的全局 toast 模式 |
| `src/lib/api.ts`、`queryKeys.ts`、`useSharedQueries.ts` | 同名文件 | 泛型 `request<T>` + 全局错误 toast、queryKey 注册表、共享 query hooks 去重 |
| `src/lib/cn.ts` | `src/lib/cn.ts` | clsx + tailwind-merge 组合 |
| `src/lib/chartTheme.ts` 及 `components/charts/*` | `src/components/EChartsCandlestick.tsx` 的 `THEME` | 哑光涨跌色、极弱网格、透明背景、深色 tooltip 的 ECharts 视觉配方（改为 CSS 变量派生） |

OverfittingPanel、校准页、墓地视图、连板梯队页的「负面拥挤信号琥珀框架」为本项目原创，无对应来源。

### MIT License notice (tickflow-stock-panel)

依 MIT 许可要求，保留其版权与许可声明：

```
MIT License

Copyright (c) 2026 tickflow-stock-panel contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
