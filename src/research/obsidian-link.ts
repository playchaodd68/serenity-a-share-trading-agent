import path from "node:path";
import { getConfig } from "../config.js";

// Obsidian deep link for any absolute path inside the vault. The vault registered in
// Obsidian is the directory holding .obsidian (obsidianVaultPath), so the URI vault
// param is its basename and the file param is the vault-relative path without ".md".
export function obsidianUriForPath(absolutePath: string, vaultPath = getConfig().obsidianVaultPath): string | null {
  const resolvedVault = path.resolve(vaultPath);
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(`${resolvedVault}${path.sep}`)) return null;
  const relative = path.relative(resolvedVault, resolved).replace(/\.md$/i, "");
  const vaultName = path.basename(resolvedVault);
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relative)}`;
}
