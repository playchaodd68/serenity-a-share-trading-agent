// Adapted from tickflow-stock-panel (MIT) — clsx + tailwind-merge 组合（社区通用模式）。
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
