import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "@/router";
import "@/styles/global.css";

// 重新构建后 chunk hash 变化，旧页面的懒加载会 404：Vite 会派发 vite:preloadError，整页刷新拿新 manifest。
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  window.location.reload();
});

// 面板是只读镜像：请求失败宁可空态不可崩，重试一次即止；错误提示统一走 api.ts 的 toast。
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("找不到 #root 挂载点");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
