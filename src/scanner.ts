import { join, relative, extname } from "path";
import { readdir, stat } from "fs/promises";
import type { VaultFile, VaultMindConfig } from "./types.js";

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function parseWikilinks(content: string): string[] {
  const links: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags);
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

function parseFrontmatter(
  content: string
): Record<string, unknown> | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("---", 3);
  if (end === -1) return null;
  const yaml = content.slice(3, end).trim();
  const result: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function countWords(content: string): number {
  // Strip frontmatter before counting
  let text = content;
  if (text.startsWith("---")) {
    const end = text.indexOf("---", 3);
    if (end !== -1) {
      text = text.slice(end + 3);
    }
  }
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

async function collectFiles(
  dir: string,
  basePath: string,
  config: VaultMindConfig
): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(basePath, fullPath);

    if (config.ignorePaths.some((p) => relPath.startsWith(p))) continue;

    if (entry.isDirectory()) {
      const nested = await collectFiles(fullPath, basePath, config);
      results.push(...nested);
    } else if (extname(entry.name) === ".md") {
      results.push(fullPath);
    }
  }

  return results;
}

export async function scanVault(
  vaultPath: string,
  config: VaultMindConfig
): Promise<VaultFile[]> {
  const filePaths = await collectFiles(vaultPath, vaultPath, config);
  const files: VaultFile[] = [];

  for (const filePath of filePaths) {
    const file = Bun.file(filePath);
    const content = await file.text();
    const stats = await stat(filePath);

    files.push({
      path: filePath,
      relativePath: relative(vaultPath, filePath),
      content,
      stats: {
        size: stats.size,
        mtime: stats.mtime,
        ctime: stats.birthtime,
      },
      wordCount: countWords(content),
      wikilinks: parseWikilinks(content),
      frontmatter: parseFrontmatter(content),
    });
  }

  return files;
}

export { parseWikilinks, parseFrontmatter, countWords };
