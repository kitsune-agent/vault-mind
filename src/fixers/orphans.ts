import { basename } from "path";
import type { VaultFile, LinkReport, FixAction } from "../types.js";

/**
 * Extract meaningful keywords from file content.
 * Strips frontmatter, headings markers, and common stop words.
 */
function extractKeywords(content: string): string[] {
  let text = content;
  // Strip frontmatter
  if (text.startsWith("---")) {
    const end = text.indexOf("---", 3);
    if (end !== -1) text = text.slice(end + 3);
  }

  // Strip markdown syntax
  text = text
    .replace(/^#+\s+/gm, "")         // headings
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1") // wikilinks → plain text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")          // markdown links
    .replace(/[*_`~]/g, "")           // formatting
    .replace(/[-–—]/g, " ");          // dashes

  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter((w) => w.length > 3);

  // Remove common stop words
  const stopWords = new Set([
    "this", "that", "with", "from", "have", "been", "will", "would",
    "could", "should", "their", "there", "here", "when", "what", "which",
    "about", "into", "through", "during", "before", "after", "above",
    "below", "between", "some", "most", "other", "than", "then", "just",
    "also", "more", "very", "much", "such", "each", "every", "both",
    "many", "like", "over", "only", "make", "made", "does", "done",
    "being", "these", "those", "them", "they", "were", "your", "file",
    "files", "link", "links", "note", "notes", "page", "content",
  ]);

  return [...new Set(words.filter((w) => !stopWords.has(w)))];
}

/**
 * Fix orphan files by finding contextually appropriate files that should link to them.
 * Analyzes orphan content keywords and matches against other files' content,
 * then adds wikilinks from the best-matching files to the orphan.
 */
export function fixOrphans(
  files: VaultFile[],
  linkReport: LinkReport
): FixAction[] {
  const actions: FixAction[] = [];
  const orphanPaths = new Set(linkReport.orphanFiles);

  // Don't try to fix orphans that have no content
  const orphansToFix = files.filter(
    (f) => orphanPaths.has(f.relativePath) && f.wordCount >= 10
  );

  if (orphansToFix.length === 0) return actions;

  // Build a map of file name → file for non-orphan files
  const nonOrphanFiles = files.filter((f) => !orphanPaths.has(f.relativePath));

  for (const orphan of orphansToFix) {
    const orphanName = basename(orphan.relativePath, ".md");
    const orphanNameLower = orphanName.toLowerCase();
    const orphanKeywords = extractKeywords(orphan.content);

    if (orphanKeywords.length === 0) continue;

    // Score each non-orphan file by how well its content relates to the orphan
    const candidates: { file: VaultFile; score: number }[] = [];

    for (const candidate of nonOrphanFiles) {
      // Skip if candidate already links to this orphan
      const existingLinks = candidate.wikilinks.map((l) => l.toLowerCase());
      if (existingLinks.includes(orphanNameLower)) continue;

      const candidateContent = candidate.content.toLowerCase();
      const candidateName = basename(candidate.relativePath, ".md").toLowerCase();

      let score = 0;

      // Check if orphan name appears in candidate content (strongest signal)
      if (candidateContent.includes(orphanNameLower)) {
        score += 10;
      }

      // Check normalized version (dashes → spaces)
      const orphanNorm = orphanNameLower.replace(/[-_]/g, " ");
      if (orphanNorm !== orphanNameLower && candidateContent.includes(orphanNorm)) {
        score += 8;
      }

      // Check keyword overlap
      const candidateKeywords = new Set(extractKeywords(candidate.content));
      let keywordMatches = 0;
      for (const kw of orphanKeywords) {
        if (candidateKeywords.has(kw)) keywordMatches++;
      }
      if (orphanKeywords.length > 0) {
        score += (keywordMatches / orphanKeywords.length) * 5;
      }

      if (score > 2) {
        candidates.push({ file: candidate, score });
      }
    }

    // Sort by score descending, take top 1-2 candidates
    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, 2);

    for (const { file: candidate } of topCandidates) {
      // Find the best place to insert the link — look for a "See also",
      // "Related", "Notes", or "References" section, otherwise add before
      // the last section or at the end of content.
      const modified = insertWikilink(candidate.content, orphanName);

      if (modified !== candidate.content) {
        actions.push({
          category: "orphans",
          description: `Add link to orphan [[${orphanName}]] from ${candidate.relativePath}`,
          filePath: candidate.relativePath,
          originalContent: candidate.content,
          newContent: modified,
          isCreate: false,
        });
      }
    }
  }

  return actions;
}

/**
 * Insert a wikilink into content at a contextually appropriate location.
 * Looks for existing sections like "See also", "Related", "Notes", "References".
 * If none found, appends a "See also" section at the end.
 */
export function insertWikilink(content: string, targetName: string): string {
  const link = `[[${targetName}]]`;

  // Check if link already exists
  if (content.includes(link)) return content;

  // Look for an existing "See also" or "Related" section
  const seeAlsoMatch = content.match(
    /^(##?\s+(?:See\s+[Aa]lso|Related|References))\s*$/m
  );

  if (seeAlsoMatch) {
    const idx = content.indexOf(seeAlsoMatch[0]);
    const afterHeader = idx + seeAlsoMatch[0].length;

    // Find what comes after the header (existing items or next section)
    const rest = content.slice(afterHeader);
    const nextSectionMatch = rest.match(/\n##?\s+/);

    if (nextSectionMatch) {
      // Insert before the next section
      const insertPoint = afterHeader + nextSectionMatch.index!;
      return (
        content.slice(0, insertPoint) +
        `\n- ${link}` +
        content.slice(insertPoint)
      );
    } else {
      // Append to end of section
      return content.trimEnd() + `\n- ${link}\n`;
    }
  }

  // Look for a "Notes" section (common in entity files)
  const notesMatch = content.match(/^(##?\s+Notes)\s*$/m);
  if (notesMatch) {
    const idx = content.indexOf(notesMatch[0]);
    const afterHeader = idx + notesMatch[0].length;
    const rest = content.slice(afterHeader);
    const nextSectionMatch = rest.match(/\n##?\s+/);

    if (nextSectionMatch) {
      const insertPoint = afterHeader + nextSectionMatch.index!;
      return (
        content.slice(0, insertPoint) +
        `\n- See also: ${link}` +
        content.slice(insertPoint)
      );
    } else {
      return content.trimEnd() + `\n- See also: ${link}\n`;
    }
  }

  // No good section found — append a "See also" section
  return content.trimEnd() + `\n\n## See also\n\n- ${link}\n`;
}

export { extractKeywords };
