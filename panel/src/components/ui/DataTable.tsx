// 通用数据表：13px 主体 + 行 hover 时边框提亮 + 左侧 2px accent 条滑入
// （蓝图 §1.1-5 hover/focus/active 有设计）。数字列请传 num 类名。
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** 单元格渲染。 */
  render: (row: T, index: number) => ReactNode;
  /** 列级 className（如 "num text-right"）。同时作用于 th/td。 */
  className?: string;
  /** 仅作用于 th。 */
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** rows 为空时渲染的空态（必传 — 数据视图必须先做空态）。 */
  empty: ReactNode;
  /** 行级附加类。 */
  rowClassName?: (row: T, index: number) => string | undefined;
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty, rowClassName, className }: DataTableProps<T>) {
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-3 py-2 text-2xs font-medium uppercase tracking-wider text-ink-3",
                  col.className,
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                "group border-b border-line/60 transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised/50",
                onRowClick && "cursor-pointer",
                rowClassName?.(row, index),
              )}
            >
              {columns.map((col, colIndex) => (
                <td key={col.key} className={cn("relative px-3 py-2 text-ink-2", col.className)}>
                  {colIndex === 0 && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-0.5 -translate-x-full bg-accent transition-transform duration-fast ease-smooth group-hover:translate-x-0"
                    />
                  )}
                  {col.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
