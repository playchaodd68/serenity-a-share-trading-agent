// 研究报告库（S3 · 蓝图 §2.3）：候选研究完整生命周期的四个视图 —
// 筛选批次 → Watchlist 追踪 → FFD 卖方研报佐证 → 墓地。
// Tab 与批次详情用 URL search params 承载（?tab= / ?run=，可分享可后退）；
// router.tsx 不属于本切片，批次详情用本页切换而非子路由。
import { Eye, FileText, Layers, Skull, type LucideIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/cn";
import { FfdReportsTab } from "./FfdReportsTab";
import { GraveyardTab } from "./GraveyardTab";
import { ScreenRunDetail } from "./ScreenRunDetail";
import { ScreensTab } from "./ScreensTab";
import { WatchlistTab } from "./WatchlistTab";

interface TabDef {
  id: "screens" | "watchlist" | "ffd" | "graveyard";
  label: string;
  icon: LucideIcon;
}

const TABS: readonly TabDef[] = [
  { id: "screens", label: "筛选批次", icon: Layers },
  { id: "watchlist", label: "Watchlist", icon: Eye },
  { id: "ffd", label: "FFD 研报", icon: FileText },
  { id: "graveyard", label: "墓地", icon: Skull },
] as const;

type LibraryTab = TabDef["id"];

function parseTab(raw: string | null): LibraryTab {
  return TABS.some((tab) => tab.id === raw) ? (raw as LibraryTab) : "screens";
}

export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));
  const runId = activeTab === "screens" ? searchParams.get("run") ?? undefined : undefined;

  const switchTab = (tab: LibraryTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    if (tab !== "screens") params.delete("run");
    setSearchParams(params);
  };

  const openRun = (nextRunId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "screens");
    params.set("run", nextRunId);
    setSearchParams(params);
  };

  const closeRun = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("run");
    setSearchParams(params);
  };

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="报告库" subtitle="筛选批次 · Watchlist · FFD 研报 · 墓地" />

      <nav aria-label="报告库分区" className="flex items-center gap-1 overflow-x-auto border-b border-line px-5">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => switchTab(tab.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors duration-fast ease-smooth",
                isActive
                  ? "border-accent font-medium text-ink"
                  : "border-transparent text-ink-3 hover:text-ink-2",
              )}
            >
              <tab.icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1 px-5 py-4">
        {activeTab === "screens" &&
          (runId ? <ScreenRunDetail runId={runId} onBack={closeRun} /> : <ScreensTab onOpenRun={openRun} />)}
        {activeTab === "watchlist" && <WatchlistTab />}
        {activeTab === "ffd" && <FfdReportsTab />}
        {activeTab === "graveyard" && <GraveyardTab />}
      </div>
    </div>
  );
}
