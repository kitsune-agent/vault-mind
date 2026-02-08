import { basename } from "path";
import type { VaultFile, LinkReport } from "../types.js";

export function analyzeLinks(files: VaultFile[]): LinkReport {
  const allLinks: string[] = [];
  const linksByFile = new Map<string, string[]>();
  const fileNames = new Set<string>();
  const fileNamesLower = new Map<string, string>(); // lowercase -> original
  const linkedTargets = new Set<string>();

  // Build file name lookup (without .md extension)
  for (const file of files) {
    const name = basename(file.relativePath, ".md");
    fileNames.add(name);
    fileNamesLower.set(name.toLowerCase(), name);
    // Also add the full relative path without extension
    const relNoExt = file.relativePath.replace(/\.md$/, "");
    fileNames.add(relNoExt);
    fileNamesLower.set(relNoExt.toLowerCase(), relNoExt);
  }

  // Collect links from all files
  for (const file of files) {
    linksByFile.set(file.relativePath, file.wikilinks);
    for (const link of file.wikilinks) {
      allLinks.push(link);
      linkedTargets.add(link.toLowerCase());
    }
  }

  // Find broken links (targets that don't match any file)
  const uniqueLinks = new Set(allLinks);
  const brokenLinks: LinkReport["brokenLinks"] = [];

  for (const file of files) {
    for (const link of file.wikilinks) {
      const linkLower = link.toLowerCase();
      if (!fileNamesLower.has(linkLower)) {
        brokenLinks.push({ source: file.relativePath, target: link });
      }
    }
  }

  // Find orphan files (no other file links to them)
  const orphanFiles: string[] = [];
  for (const file of files) {
    const name = basename(file.relativePath, ".md").toLowerCase();
    const relNoExt = file.relativePath.replace(/\.md$/, "").toLowerCase();
    if (!linkedTargets.has(name) && !linkedTargets.has(relNoExt)) {
      orphanFiles.push(file.relativePath);
    }
  }

  // Connectivity: ratio of files that are linked to vs total
  const linkedFileCount = files.length - orphanFiles.length;
  const connectivityScore =
    files.length > 0 ? linkedFileCount / files.length : 0;

  return {
    totalLinks: allLinks.length,
    uniqueLinks: uniqueLinks.size,
    brokenLinks,
    orphanFiles,
    connectivityScore,
    linksByFile,
  };
}
