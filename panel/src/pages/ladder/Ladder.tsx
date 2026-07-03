// Adapted from tickflow-stock-panel (MIT) — LimitUpLadder 页版式（统计条 + 分层折叠 + 日期选择）。
// 数据源与语义框架为本项目原创（蓝图 §2.2）：
// 方法论铁律：梯队高度是「负面拥挤度信号」（src/connectors/limit-up-ladder.ts 头注释同源），
// 页面用 warning 琥珀框架，永不借用红色"强势"暗示，本页不构成买入信号。
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarOff, Layers, RotateCcw, ServerCrash } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { LadderHistorySpark } from "@/pages/ladder/LadderHistorySpark";
import { LadderStatsBar } from "@/pages/ladder/LadderStatsBar";
import { TierGroup } from "@/pages/ladder/TierGroup";
import { useLadderSnapshot } from "@/pages/ladder/useLadderSnapshot";

/** 本地时区今日 YYYY-MM-DD。 */
function todayDashed(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const METHODOLOGY_NOTE =
  "拥挤度 = 负面信号视角——梯队越高、情绪越热，方法论上越要求降权，本页不构成买入信号。";

export default function Ladder() {
  const today = todayDashed();
  const [date, setDate] = useState<string>("");
  const isToday = date === "" || date === today;
  const query = useLadderSnapshot(isToday ? undefined : date);
  const snapshot = query.data?.snapshot ?? null;
  const notFound = query.data?.notFound ?? false;

  // height 降序；空梯队层不渲染
  const tiers = useMemo(
    () =>
      (snapshot?.ladder ?? [])
        .filter((tier) => tier.stocks.length > 0)
        .slice()
        .sort((a, b) => b.height - a.height),
    [snapshot],
  );

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="连板梯队"
        subtitle="交易侧拥挤度观测"
        titleExtra={<Badge variant="warning">负面信号视角</Badge>}
        right={
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor="ladder-date" className="text-2xs text-ink-3">
              快照日期
            </label>
            <input
              id="ladder-date"
              type="date"
              value={date === "" ? today : date}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              className="num rounded-input border border-line bg-surface px-2 py-1 text-xs text-ink [color-scheme:dark]"
            />
            {!isToday && (
              <button
                type="button"
                onClick={() => setDate("")}
                className="flex items-center gap-1 rounded-btn border border-line px-2 py-1 text-2xs text-ink-2 transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised hover:text-ink"
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                回到今日
              </button>
            )}
          </div>
        }
      />

      {/* 页头固定琥珀徽标：方法论视角声明（蓝图 §2.2） */}
      <div
        role="note"
        className="mx-5 mt-3 flex items-start gap-2 rounded-card border border-warning/35 bg-warning/[0.08] px-3 py-2 text-xs leading-relaxed text-warning"
      >
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <span>{METHODOLOGY_NOTE}</span>
      </div>

      <div className="flex-1 px-5 py-4">
        {query.isLoading ? (
          <div className="grid min-h-[16rem] place-items-center text-sm text-ink-3" role="status">
            加载梯队快照…
          </div>
        ) : notFound ? (
          <EmptyState
            icon={CalendarOff}
            title="该日无缓存快照"
            hint={
              <>
                历史日期只读 <span className="num">runs/ladder/</span> 落盘缓存，不做现场抓取；
                只有面板运行当天抓取过的交易日才有快照。请换一个日期或回到今日。
              </>
            }
            action={
              <button
                type="button"
                onClick={() => setDate("")}
                className="rounded-btn border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised hover:text-ink"
              >
                回到今日
              </button>
            }
          />
        ) : query.isError ? (
          <EmptyState
            icon={ServerCrash}
            title="梯队数据获取失败"
            hint={query.error instanceof Error ? query.error.message : "数据源暂不可达，请稍后重试。"}
            action={
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="rounded-btn border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised hover:text-ink"
              >
                重试
              </button>
            }
          />
        ) : snapshot ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
            <div className="min-w-0 space-y-4">
              <LadderStatsBar stats={snapshot.stats} date={snapshot.date} />
              <SectionTitle
                icon={Layers}
                title="梯队分层"
                hint={`${snapshot.date} · ${tiers.length} 层`}
              />
              {tiers.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="该日无涨停记录"
                  hint="快照存在但梯队为空——当日无个股触及涨停，拥挤度处于低位。"
                />
              ) : (
                <div className="space-y-3">
                  {tiers.map((tier) => (
                    // 首板通常最庞杂且信息最弱，默认折叠；≥2 板默认展开
                    <TierGroup key={tier.height} tier={tier} defaultOpen={tier.height >= 2} />
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-4">
              <LadderHistorySpark />
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Layers}
            title="暂无梯队数据"
            hint="服务端未返回快照。确认 panel-server 正在运行后重试。"
          />
        )}
      </div>

      {/* 页脚声明（P0-6 §2e）：bias_turn 是观察 overlay，绝不参与任何评分/排序 */}
      <p role="note" className="border-t border-line px-5 py-3 text-2xs leading-relaxed text-ink-3">
        换手率乖离（「热度 X× 平时」= 近5日日均换手 ÷ 自身近480交易日日均换手）为拥挤度观察指标，不构成交易信号；
        ≥3× 琥珀 / ≥5× 红为暂定绝对档，待自有数据重校准。仅对连板高度 ≥2 的股票计算，缺失即不显示。
      </p>
    </div>
  );
}
