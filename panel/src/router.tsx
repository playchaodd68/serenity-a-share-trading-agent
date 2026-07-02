// 路由表：6 页 + Layout 壳。每页 React.lazy 按页分包（配合 EChart 的动态 import，
// 保证 echarts 等重依赖不进首屏 chunk）。import 路径与蓝图 §4 pages/ 结构一致，
// 后续切片只替换页面文件内容，不改此处路径。
import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/shell/Layout";

const Dashboard = lazy(() => import("@/pages/dashboard/Dashboard"));
const Ladder = lazy(() => import("@/pages/ladder/Ladder"));
const Library = lazy(() => import("@/pages/library/Library"));
const Backtest = lazy(() => import("@/pages/backtest/Backtest"));
const Calibration = lazy(() => import("@/pages/calibration/Calibration"));
const Portfolio = lazy(() => import("@/pages/portfolio/Portfolio"));

function page(node: ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="grid h-full place-items-center py-24 text-sm text-ink-3" role="status">
          加载中…
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: page(<Dashboard />) },
      { path: "ladder", element: page(<Ladder />) },
      { path: "library", element: page(<Library />) },
      { path: "backtest", element: page(<Backtest />) },
      { path: "calibration", element: page(<Calibration />) },
      { path: "portfolio", element: page(<Portfolio />) },
    ],
  },
]);
