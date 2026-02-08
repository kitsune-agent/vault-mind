import { basename, join } from "path";
import { existsSync } from "fs";
import type { VaultFile, LinkReport } from "../types.js";

/**
 * Directories whose files are expected to be orphaned (structural).
 * Files here won't penalize connectivity scores.
 */
const STRUCTURAL_DIRS = [
  "memory/",
  "memory\\",
  "reports/",
  "reports\\",
  "templates/",
  "templates\\",
  "skills/",
  "skills\\",
  "docs/",
  "docs\\",
  "research/",
  "research\\",
];

function isStructuralPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return STRUCTURAL_DIRS.some((dir) =>
    normalized.startsWith(dir.replace(/\\/g, "/"))
  );
}

export function analyzeLinks(
  files: VaultFile[],
  vaultPath?: string
): LinkReport {
  const allLinks: string[] = [];
  const linksByFile = new Map<string, string[]>();
  const fileNames = new Set<string>();
  const fileNamesLower = new Map<string, string>(); // lowercase -> original
  const linkedTargets = new Set<string>();
  const fileRelativePaths = new Set<string>(); // full relative paths for path-style resolution

  // Build file name lookup (without .md extension)
  for (const file of files) {
    const name = basename(file.relativePath, ".md");
    fileNames.add(name);
    fileNamesLower.set(name.toLowerCase(), name);
    // Also add the full relative path without extension
    const relNoExt = file.relativePath.replace(/\.md$/, "");
    fileNames.add(relNoExt);
    fileNamesLower.set(relNoExt.toLowerCase(), relNoExt);
    // Track full relative paths (with .md) for path-style resolution
    fileRelativePaths.add(file.relativePath);
    fileRelativePaths.add(file.relativePath.toLowerCase());
  }

  // Track path-style links for reporting
  const pathStyleLinks: LinkReport["pathStyleLinks"] = [];

  /**
   * Resolve a link target, returning true if it matches a known file.
   * Handles: plain names, section links (Foo#Bar), path-style links (bank/opinions.md).
   */
  function resolveLink(target: string): {
    valid: boolean;
    pathStyle?: boolean;
    suggestedName?: string;
  } {
    // 1. Section link: split on first # and resolve file part
    if (target.includes("#")) {
      const hashIdx = target.indexOf("#");
      const filePart = target.slice(0, hashIdx).trim();

      // If file part is empty (e.g., [[#Section]]), it's a self-reference — always valid
      if (filePart === "") {
        return { valid: true };
      }

      // Resolve the file part using the same logic (recursion without the # part)
      return resolveLink(filePart);
    }

    // 2. Plain name match (standard Obsidian resolution)
    const targetLower = target.toLowerCase();
    if (fileNamesLower.has(targetLower)) {
      // If the target contains `/`, it's a path-style link — valid but non-standard
      if (target.includes("/")) {
        const withoutMd = target.endsWith(".md")
          ? target.slice(0, -3)
          : target;
        const suggestedName = basename(withoutMd);
        return { valid: true, pathStyle: true, suggestedName };
      }
      return { valid: true };
    }

    // 3. Path-style link resolution: target contains / but wasn't found via plain match
    if (target.includes("/")) {
      // Try as-is (with .md)
      const withMd = target.endsWith(".md") ? target : target + ".md";
      const withoutMd = target.endsWith(".md")
        ? target.slice(0, -3)
        : target;

      if (
        fileRelativePaths.has(withMd) ||
        fileRelativePaths.has(withMd.toLowerCase()) ||
        fileRelativePaths.has(withoutMd) ||
        fileRelativePaths.has(withoutMd.toLowerCase())
      ) {
        // Get suggested short name
        const suggestedName = basename(withoutMd);
        return { valid: true, pathStyle: true, suggestedName };
      }

      // Also try filesystem resolution if vaultPath is provided
      if (vaultPath) {
        const fullPath = join(vaultPath, withMd);
        const fullPathNoExt = join(vaultPath, withoutMd + ".md");
        if (existsSync(fullPath) || existsSync(fullPathNoExt)) {
          const suggestedName = basename(withoutMd);
          return { valid: true, pathStyle: true, suggestedName };
        }
      }
    }

    return { valid: false };
  }

  // Collect links from all files
  for (const file of files) {
    linksByFile.set(file.relativePath, file.wikilinks);
    for (const link of file.wikilinks) {
      allLinks.push(link);
      // For linked target tracking, normalize: strip # section, resolve to lowercase
      let normalizedTarget = link;
      if (normalizedTarget.includes("#")) {
        const filePart = normalizedTarget.slice(
          0,
          normalizedTarget.indexOf("#")
        ).trim();
        normalizedTarget = filePart || basename(file.relativePath, ".md"); // self-ref
      }
      linkedTargets.add(normalizedTarget.toLowerCase());
      // Also add basename for path-style links
      if (normalizedTarget.includes("/")) {
        const bn = basename(normalizedTarget.replace(/\.md$/, ""));
        linkedTargets.add(bn.toLowerCase());
      }
    }
  }

  // Find broken links (targets that don't match any file)
  const uniqueLinks = new Set(allLinks);
  const brokenLinks: LinkReport["brokenLinks"] = [];

  for (const file of files) {
    for (const link of file.wikilinks) {
      const resolution = resolveLink(link);
      if (!resolution.valid) {
        brokenLinks.push({ source: file.relativePath, target: link });
      } else if (resolution.pathStyle && resolution.suggestedName) {
        pathStyleLinks.push({
          source: file.relativePath,
          target: link,
          suggestedName: resolution.suggestedName,
        });
      }
    }
  }

  // Find orphan files (no other file links to them) and classify
  const orphanFiles: string[] = [];
  const structuralOrphans: string[] = [];
  const knowledgeOrphans: string[] = [];

  for (const file of files) {
    const name = basename(file.relativePath, ".md").toLowerCase();
    const relNoExt = file.relativePath.replace(/\.md$/, "").toLowerCase();
    if (!linkedTargets.has(name) && !linkedTargets.has(relNoExt)) {
      orphanFiles.push(file.relativePath);
      if (isStructuralPath(file.relativePath)) {
        structuralOrphans.push(file.relativePath);
      } else {
        knowledgeOrphans.push(file.relativePath);
      }
    }
  }

  // Connectivity: ratio of files that are linked to vs total
  const linkedFileCount = files.length - orphanFiles.length;
  const connectivityScore =
    files.length > 0 ? linkedFileCount / files.length : 0;

  // Knowledge connectivity: only count non-structural files
  const knowledgeFiles = files.filter(
    (f) => !isStructuralPath(f.relativePath)
  );
  const knowledgeOrphanCount = knowledgeOrphans.length;
  const knowledgeLinkedCount = knowledgeFiles.length - knowledgeOrphanCount;
  const knowledgeConnectivity =
    knowledgeFiles.length > 0
      ? knowledgeLinkedCount / knowledgeFiles.length
      : 0;

  return {
    totalLinks: allLinks.length,
    uniqueLinks: uniqueLinks.size,
    brokenLinks,
    orphanFiles,
    structuralOrphans,
    knowledgeOrphans,
    pathStyleLinks,
    connectivityScore,
    knowledgeConnectivity,
    linksByFile,
  };
}

export { isStructuralPath };
