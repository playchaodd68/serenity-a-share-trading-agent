// Adapted from tickflow-stock-panel (MIT) — grid-cols-[14.5rem_1fr] 终端壳骨架。
// 升级点：<lg 折叠为顶栏 + 抽屉；右下角全局 Chat 触发按钮（lazy 加载 ChatDrawer）。
import { Suspense, lazy, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, MessageSquare, X } from "lucide-react";
import { Sidebar } from "@/components/shell/Sidebar";
import { ToastContainer } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

// S6 会替换 ChatDrawer 实现；接口约定 props: { open, onClose }。
const ChatDrawer = lazy(() => import("@/components/chat/ChatDrawer"));

export function Layout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const location = useLocation();

  // 路由变化时收起移动端导航
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] lg:grid-cols-[14.5rem_1fr] lg:grid-rows-1">
      {/* <lg：顶栏 + 抽屉；lg+：常驻侧边栏 */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label={mobileNavOpen ? "关闭导航" : "打开导航"}
          aria-expanded={mobileNavOpen}
          className="rounded-btn p-1.5 text-ink-2 transition-colors duration-fast ease-smooth hover:bg-raised hover:text-ink"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="text-sm font-semibold tracking-tight text-ink">Serenity 研究面板</span>
      </div>

      <Sidebar className="hidden lg:flex" />

      {/* 移动端导航抽屉 */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[900] lg:hidden">
          <button
            type="button"
            aria-label="关闭导航"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-base/60"
          />
          <div className="absolute inset-y-0 left-0 flex w-[14.5rem] max-w-[85vw] shadow-overlay">
            <Sidebar className="w-full" onNavigate={() => setMobileNavOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="关闭导航"
              className="absolute right-2 top-3 rounded-btn p-1.5 text-ink-3 hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <main className="min-h-0 overflow-y-auto">
        <Outlet />
      </main>

      {/* 全局 Chat 触发按钮（右下角） */}
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label="打开研究助手对话"
        className={cn(
          "fixed bottom-5 right-5 z-[800] grid h-11 w-11 place-items-center rounded-pill border border-line-strong bg-raised text-ink-2 shadow-raised",
          "transition-all duration-fast ease-smooth hover:-translate-y-0.5 hover:text-accent",
        )}
      >
        <MessageSquare className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>

      {chatOpen && (
        <Suspense fallback={null}>
          <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
        </Suspense>
      )}

      <ToastContainer />
    </div>
  );
}
