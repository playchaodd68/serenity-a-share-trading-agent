// 分组导航（蓝图对参考项目"14 项平铺"的升级）：组标题 + 图标导航项，激活态 bg-raised + accent 左条。
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroupProps {
  label: string;
  items: NavItem[];
  /** 移动端抽屉里点击导航后收起。 */
  onNavigate?: () => void;
}

export function NavGroup({ label, items, onNavigate }: NavGroupProps) {
  return (
    <div>
      <div className="px-3 pb-1 pt-4 text-2xs font-medium uppercase tracking-wider text-ink-3">{label}</div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-btn px-3 py-1.5 text-sm text-ink-2 transition-colors duration-fast ease-smooth",
                  "hover:bg-raised hover:text-ink",
                  isActive && "bg-raised font-medium text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-1 left-0 w-0.5 rounded-pill bg-accent transition-transform duration-fast ease-smooth",
                      isActive ? "scale-y-100" : "scale-y-0",
                    )}
                  />
                  <item.icon
                    className={cn("h-4 w-4 shrink-0", isActive ? "text-accent" : "text-ink-3 group-hover:text-ink-2")}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
