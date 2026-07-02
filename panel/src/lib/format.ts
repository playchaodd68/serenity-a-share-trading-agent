// 数字 / 金额 / 日期格式化 — 全部输出应放在 .num 等宽容器中展示。

/** 缺失值占位符（与后端"宁可空态不可崩"约定一致）。 */
export const NA = "—";

/** 金额（元）→ 亿元/万元中文单位，如 3.24亿 / 5600万。 */
export function fmtYi(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return NA;
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(digits)}万亿`;
  if (abs >= 1e8) return `${(v / 1e8).toFixed(digits)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(0)}万`;
  return v.toFixed(0);
}

/** 小数比率 → 百分比，如 0.0234 → +2.34%。signed=false 时不带正号。 */
export function fmtPct(v: number | null | undefined, digits = 2, signed = true): string {
  if (v == null || Number.isNaN(v)) return NA;
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

/** 已是百分数数值（如 pctChange=5.67 表示 5.67%）→ +5.67%。 */
export function fmtPctPoint(v: number | null | undefined, digits = 2, signed = true): string {
  if (v == null || Number.isNaN(v)) return NA;
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

/** 普通数字，保留 digits 位小数。 */
export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return NA;
  return v.toFixed(digits);
}

/** ISO / Date → YYYY-MM-DD。 */
export function fmtDate(s: string | Date | null | undefined): string {
  if (s == null || s === "") return NA;
  const d = typeof s === "string" ? new Date(s) : s;
  if (Number.isNaN(d.getTime())) return String(s);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** ISO → YYYY-MM-DD HH:mm（本地时区）。 */
export function fmtDateTime(s: string | Date | null | undefined): string {
  if (s == null || s === "") return NA;
  const d = typeof s === "string" ? new Date(s) : s;
  if (Number.isNaN(d.getTime())) return String(s);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDate(d)} ${hh}:${mi}`;
}

/** ISO → 相对时间（如 5分钟前 / 3天前），用于数据新鲜度徽标。 */
export function fmtRelative(s: string | null | undefined): string {
  if (s == null || s === "") return NA;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return NA;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return fmtDateTime(s);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return fmtDate(s);
}

/**
 * 封板时间：兼容 HHMMSS 整数（92500 → 09:25:00）与已格式化的 "HH:MM" 字符串。
 * ladder connector 已把 fbt 转为 "HH:MM"，此函数对两种来源都安全。
 */
export function fmtSealTime(v: number | string | null | undefined): string {
  if (v == null || v === "") return NA;
  if (typeof v === "string") return v;
  if (!Number.isFinite(v) || v < 0) return NA;
  const padded = String(Math.trunc(v)).padStart(6, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
}

/**
 * A 股语义色：红涨绿跌 — 仅用于价格 / 收益相关元素（tokens.css 铁律），
 * 严禁用于 UI 状态。
 */
export function priceColorClass(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v) || v === 0) return "text-ink-3";
  return v > 0 ? "text-bull" : "text-bear";
}
