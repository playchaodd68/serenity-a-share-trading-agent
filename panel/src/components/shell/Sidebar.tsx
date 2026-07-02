// Adapted from tickflow-stock-panel (MIT) — 侧边栏"品牌块 / 导航 / 底部状态区"三段式骨架；
// 升级点：导航分组（研究/市场/评估/账户），底部为数据新鲜度区（读 /api/health）。
// 品牌 violet 全站仅允许出现在此品牌块。
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  FlaskConical,
  Layers,
  LayoutDashboard,
  LogOut,
  Target,
  Wallet,
} from "lucide-react";
import { NavGroup, type NavItem } from "@/components/shell/NavGroup";
import { api } from "@/lib/api";
import { useAuthStatus, useHealth } from "@/lib/useSharedQueries";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "研究",
    items: [
      { to: "/", label: "总览", icon: LayoutDashboard },
      { to: "/library", label: "报告库", icon: BookOpen },
    ],
  },
  {
    label: "市场",
    items: [{ to: "/ladder", label: "连板梯队", icon: Layers }],
  },
  {
    label: "评估",
    items: [
      { to: "/backtest", label: "回测", icon: FlaskConical },
      { to: "/calibration", label: "校准", icon: Target },
    ],
  },
  {
    label: "账户",
    items: [{ to: "/portfolio", label: "持仓", icon: Wallet }],
  },
];

/** 底部数据新鲜度区：服务健康 + 最新 screen run 时间。 */
function DataFreshness() {
  const { data, isError, isLoading } = useHealth();
  const online = Boolean(data?.ok) && !isError;

  return (
    <div className="border-t border-line px-4 py-3 text-2xs text-ink-3">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-pill", online ? "bg-accent" : "bg-danger", isLoading && "bg-ink-3")}
        />
        <span className="text-ink-2">{isLoading ? "连接中…" : online ? "服务在线" : "服务离线"}</span>
        {data?.version && <span className="num ml-auto">{data.version}</span>}
      </div>
      <dl className="mt-2 space-y-1">
        <div className="flex justify-between gap-2">
          <dt>最新筛选</dt>
          <dd className="num text-ink-2">{fmtRelative(data?.dataFreshness.latestScreenAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>校准快照</dt>
          <dd className="num text-ink-2">{fmtRelative(data?.dataFreshness.calibrationAt)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>最新回测</dt>
          <dd className="num text-ink-2">{fmtRelative(data?.dataFreshness.backtestAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** 退出登录 — 仅在服务端启用了密码保护（status.required）时显示。 */
function LogoutButton() {
  const { data: status } = useAuthStatus();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  if (!status?.required) return null;

  const handleLogout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await api.logout();
    } finally {
      setPending(false);
      // auth-status 变为未认证后 LoginGate 收口，业务查询一并作废。
      await queryClient.invalidateQueries();
    }
  };

  return (
    <div className="border-t border-line px-2 py-1.5">
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-btn px-2 py-1.5 text-2xs text-ink-3",
          "transition-colors duration-fast ease-smooth hover:bg-raised hover:text-ink disabled:opacity-50",
        )}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        {pending ? "退出中…" : "退出登录"}
      </button>
    </div>
  );
}

interface SidebarProps {
  /** 移动端抽屉里点击导航后收起。 */
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ onNavigate, className }: SidebarProps) {
  return (
    <aside className={cn("flex h-full flex-col overflow-hidden border-r border-line bg-surface", className)}>
      {/* 品牌块 — violet 仅此处 */}
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-btn bg-violet/15 text-violet"
        >
          <Activity className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold tracking-tight text-ink">Serenity</div>
          <div className="text-2xs text-ink-3">研究面板</div>
        </div>
      </div>

      {/* 分组导航 */}
      <nav aria-label="主导航" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.label} label={group.label} items={group.items} onNavigate={onNavigate} />
        ))}
      </nav>

      <DataFreshness />
      <LogoutButton />
    </aside>
  );
}
