// 持仓表：每行 = 持仓主行 + 关联区（watchlist 状态 / 最新 screen 得分 / 墓地子行）。
// 版式沿用 ui/DataTable 的行 hover 语法；因需要墓地子行（rowSpan 结构）在此局部实现。
// 铁律 1：portfolio schema 无权重字段 → 显示「权重未提供」，不臆造（蓝图 §2.6）。
// 铁律 2：墓地子行按语义分级（graveyardTiers.ts）——主动否决类保留红色警告；
//         evidence-gap / below-entry-bar 是中性档案，绝不渲染成红色否决。
import { Info, Skull } from "lucide-react";
import { Badge, WatchlistStatusBadge } from "@/components/ui/Badge";
import { fmtDate, fmtNum, NA } from "@/lib/format";
import type { GraveyardReason, PortfolioPositionView } from "@/lib/types";
import { isActiveReject } from "@/pages/portfolio/graveyardTiers";

interface PositionTableProps {
  positions: PortfolioPositionView[];
}

type BuriedView = NonNullable<PortfolioPositionView["graveyard"]>;

const ACTIVE_REJECT_LABEL: Partial<Record<GraveyardReason, string>> = {
  "kill-triggered": "触发 Kill 条件",
  downgraded: "已降权",
  "manual-reject": "人工否决",
};

/** 墓地行左侧 danger 警示条：td 的 inset shadow（tr 的 border-left 跨浏览器不可靠）。 */
const DANGER_BAR = "shadow-[inset_2px_0_0_0_theme(colors.danger/70%)]";

const HEADER_CELL = "px-3 py-2 text-left text-2xs font-medium uppercase tracking-wider text-ink-3";
const BODY_CELL = "px-3 py-2.5 align-top text-ink-2";

export function PositionTable({ positions }: PositionTableProps) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={HEADER_CELL}>代码</th>
            <th scope="col" className={HEADER_CELL}>名称</th>
            <th scope="col" className={HEADER_CELL}>权重</th>
            <th scope="col" className={HEADER_CELL}>关注状态</th>
            <th scope="col" className={`${HEADER_CELL} text-right`}>最新筛选分</th>
            <th scope="col" className={HEADER_CELL}>备注</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const buried = position.graveyard;
            return (
              <PositionRows key={position.code} position={position} buried={buried} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 墓地关联子行：主动否决类红色警告 / 中性类灰色档案，两种语义严格分离。 */
function GraveyardNoteRow({ buried }: { buried: BuriedView }) {
  if (isActiveReject(buried.reason)) {
    return (
      <tr className="border-b border-line bg-danger/[0.07]">
        <td colSpan={6} className={`px-3 py-2 ${DANGER_BAR}`}>
          <div className="flex items-start gap-2 text-xs leading-relaxed text-danger">
            <Skull className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>
              <strong className="font-semibold">该持仓曾被主动否决</strong>
              （{ACTIVE_REJECT_LABEL[buried.reason] ?? buried.reason} ·{" "}
              <span className="num">{fmtDate(buried.buriedAt)}</span>）：{buried.detail || "无详情记录"}
            </span>
          </div>
        </td>
      </tr>
    );
  }

  const isEvidenceGap = buried.reason === "evidence-gap";
  return (
    <tr className="border-b border-line bg-raised/50">
      <td colSpan={6} className="px-3 py-2">
        <div className="flex items-start gap-2 text-xs leading-relaxed text-ink-3">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {isEvidenceGap ? (
              <Badge variant="muted">未入选：证据覆盖不足</Badge>
            ) : (
              <Badge variant="outline">未达入场线（分数 {fmtNum(buried.score, 1)}）</Badge>
            )}
            <span>
              {isEvidenceGap
                ? "系统当时缺少材料，非主动否决"
                : "证据已读但评分未过门槛，非否决警告"}
              （<span className="num">{fmtDate(buried.buriedAt)}</span>）
              {buried.detail ? ` · ${buried.detail}` : ""}
            </span>
          </span>
        </div>
      </td>
    </tr>
  );
}

function PositionRows({
  position,
  buried,
}: {
  position: PortfolioPositionView;
  buried: PortfolioPositionView["graveyard"];
}) {
  // 仅主动否决类给主行加红色警示条；中性档案不加（无知 ≠ 否决）。
  const dangerBar = buried && isActiveReject(buried.reason) ? ` ${DANGER_BAR}` : "";
  return (
    <>
      <tr className="group border-b border-line transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised">
        <td className={`num ${BODY_CELL}${dangerBar}`}>
          {position.code}
        </td>
        <td className={`${BODY_CELL} font-medium text-ink`}>{position.name || NA}</td>
        <td className={BODY_CELL}>
          <span
            className="text-2xs text-ink-3"
            title="持仓文件 schema 未包含权重字段，面板不做臆造"
          >
            权重未提供
          </span>
        </td>
        <td className={BODY_CELL}>
          {position.watchlist ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <WatchlistStatusBadge status={position.watchlist.status} />
              <span className="num text-xs text-ink">{fmtNum(position.watchlist.score, 1)} 分</span>
              <span className="text-2xs text-ink-3">
                复核 <span className="num">{fmtDate(position.watchlist.nextReviewAt)}</span>
              </span>
            </div>
          ) : (
            <span className="text-2xs text-ink-3">未在关注列表</span>
          )}
        </td>
        <td className={`${BODY_CELL} text-right`}>
          {position.latestScreenScore != null ? (
            <span className="num text-ink">{fmtNum(position.latestScreenScore, 1)}</span>
          ) : (
            <span className="text-2xs text-ink-3">未入选最新批次</span>
          )}
        </td>
        <td className={`${BODY_CELL} max-w-[18rem]`}>
          <span className="block truncate text-xs" title={position.note || undefined}>
            {position.note || NA}
          </span>
        </td>
      </tr>

      {/* 墓地关联子行（语义分级） */}
      {buried && <GraveyardNoteRow buried={buried} />}
    </>
  );
}
