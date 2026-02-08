import { basename } from "path";
import type { VaultFile, QualityReport, FixAction } from "../types.js";

/**
 * Normalize a file name for text matching: lowercase, remove dashes/underscores,
 * handle camelCase splitting.
 */
function nameVariants(name: string): string[] {
  const lower = name.toLowerCase();
  const dashed = lower.replace(/[-_]/g, " ");
  const camelSplit = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();

  const variants = new Set([lower, dashed, camelSplit]);

  // Also add without common prefixes/suffixes
  for (const v of [...variants]) {
    if (v.length > 4) variants.add(v);
  }

  return [...variants].filter((v) => v.length >= 3);
}

/**
 * Check if a name is mentioned in content, avoiding matches inside
 * existing wikilinks, code blocks, or frontmatter.
 */
function findMentions(
  content: string,
  name: string
): { found: boolean; positions: number[] } {
  let text = content;

  // Strip frontmatter
  if (text.startsWith("---")) {
    const end = text.indexOf("---", 3);
    if (end !== -1) {
      text = " ".repeat(end + 3) + text.slice(end + 3);
    }
  }

  // Blank out existing wikilinks to avoid double-linking
  text = text.replace(/\[\[[^\]]+\]\]/g, (match) => " ".repeat(match.length));

  // Blank out code blocks
  text = text.replace(/```[\s\S]*?```/g, (match) => " ".repeat(match.length));
  text = text.replace(/`[^`]+`/g, (match) => " ".repeat(match.length));

  const positions: number[] = [];
  const variants = nameVariants(name);
  const textLower = text.toLowerCase();

  for (const variant of variants) {
    // Word boundary match
    const regex = new RegExp(
      `(?:^|[\\s.,;:!?("'])${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s.,;:!?)"'])`,
      "gi"
    );
    let match: RegExpExecArray | null;
    while ((match = regex.exec(textLower)) !== null) {
      // Adjust position if we matched a leading boundary char
      const pos = match[0].length > variant.length ? match.index + 1 : match.index;
      positions.push(pos);
    }
  }

  return { found: positions.length > 0, positions };
}

/**
 * Fix isolated files (files with no outgoing wikilinks) by scanning their
 * content for mentions of known file/entity names and converting those
 * mentions into wikilinks.
 */
export function fixIsolated(
  files: VaultFile[],
  qualityReport: QualityReport
): FixAction[] {
  const actions: FixAction[] = [];
  const isolatedPaths = new Set(qualityReport.isolatedFiles);

  // Build list of all known entity names (file basenames without .md)
  const knownNames: { name: string; relativePath: string }[] = [];
  for (const file of files) {
    const name = basename(file.relativePath, ".md");
    // Skip very short names (likely acronyms or generic)
    if (name.length >= 3) {
      knownNames.push({ name, relativePath: file.relativePath });
    }
  }

  for (const file of files) {
    if (!isolatedPaths.has(file.relativePath)) continue;
    if (file.wordCount < 5) continue; // Skip nearly empty files

    const selfName = basename(file.relativePath, ".md");
    let modified = file.content;
    const addedLinks: string[] = [];

    // Check each known name against this file's content
    for (const { name, relativePath } of knownNames) {
      // Don't self-link
      if (relativePath === file.relativePath) continue;

      const { found, positions } = findMentions(modified, name);
      if (!found || positions.length === 0) continue;

      // Only convert the FIRST mention to a wikilink (less intrusive)
      const firstPos = positions[0];

      // Find the actual text at this position to preserve casing
      const variants = nameVariants(name);
      let matchedText: string | null = null;

      for (const variant of [name, ...variants]) {
        const textAtPos = modified.slice(firstPos, firstPos + variant.length);
        if (textAtPos.toLowerCase() === variant.toLowerCase()) {
          matchedText = textAtPos;
          break;
        }
      }

      if (!matchedText) continue;

      // Check we're not inside a wikilink already (safety check on current state)
      const before = modified.slice(Math.max(0, firstPos - 2), firstPos);
      const after = modified.slice(
        firstPos + matchedText.length,
        firstPos + matchedText.length + 2
      );
      if (before === "[[" || after === "]]") continue;

      // Replace with wikilink — use display alias if casing differs
      const replacement =
        matchedText === name
          ? `[[${name}]]`
          : `[[${name}|${matchedText}]]`;

      modified =
        modified.slice(0, firstPos) +
        replacement +
        modified.slice(firstPos + matchedText.length);

      addedLinks.push(name);
    }

    if (addedLinks.length > 0 && modified !== file.content) {
      actions.push({
        category: "isolated",
        description: `Add wikilinks to isolated file ${file.relativePath}: ${addedLinks.map((n) => `[[${n}]]`).join(", ")}`,
        filePath: file.relativePath,
        originalContent: file.content,
        newContent: modified,
        isCreate: false,
      });
    }
  }

  return actions;
}

export { findMentions, nameVariants };
