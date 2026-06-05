import { Converter } from "opencc-js";

const taiwanToMainland = Converter({ from: "twp", to: "cn" });
const hongKongToMainland = Converter({ from: "hk", to: "cn" });

const COMMON_TRADITIONAL_CHARS = /[產業邏輯資標訊臺灣後續發現體軟數據報獲風險與對應關鍵證]/;

export function toSimplifiedChinese(text: string): string {
  if (!text) return text;
  return hongKongToMainland(taiwanToMainland(text));
}

export function containsCommonTraditionalChinese(text: string): boolean {
  return COMMON_TRADITIONAL_CHARS.test(text);
}
