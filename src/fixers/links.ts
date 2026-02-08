import { basename, dirname, join } from "path";
import type { VaultFile, LinkReport, FixAction } from "../types.js";

/**
 * Compute Levenshtein distance between two strings.
 * No external deps — implemented inline.
 */
export function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;

  if (la === 0) return lb;
  if (lb === 0) return la;

  // Use two rows instead of full matrix for memory efficiency
  let prev = new Array(lb + 1);
  let curr = new Array(lb + 1);

  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[lb];
}

/**
 * Normalize a name for comparison: lowercase, replace dashes/underscores with spaces, trim.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the best fuzzy match for a broken link target among existing file names.
 * Returns the matching filename or null if no close match is found.
 */
export function findBestMatch(
  target: string,
  fileNames: string[],
  threshold = 0.4
): string | null {
  const normTarget = normalize(target);
  let bestMatch: string | null = null;
  let bestScore = Infinity;

  for (const name of fileNames) {
    const normName = normalize(name);

    // Exact match after normalization (handles case + dash/space differences)
    if (normTarget === normName) {
      return name;
    }

    const distance = levenshtein(normTarget, normName);
    const maxLen = Math.max(normTarget.length, normName.length);
    const ratio = distance / maxLen;

    if (ratio < threshold && distance < bestScore) {
      bestScore = distance;
      bestMatch = name;
    }
  }

  return bestMatch;
}

/**
 * Generate fix actions for broken wikilinks.
 * - Close fuzzy match → rewrite the link in the source file
 * - No match → create a stub .md file for the target
 */
export function fixBrokenLinks(
  files: VaultFile[],
  linkReport: LinkReport
): FixAction[] {
  const actions: FixAction[] = [];

  // Build lookup of all file names (without .md)
  const fileNames: string[] = [];
  for (const file of files) {
    fileNames.push(basename(file.relativePath, ".md"));
  }

  // Deduplicate broken link targets per source to avoid double-fixing
  const brokenBySource = new Map<string, Set<string>>();
  for (const bl of linkReport.brokenLinks) {
    const existing = brokenBySource.get(bl.source) ?? new Set();
    existing.add(bl.target);
    brokenBySource.set(bl.source, existing);
  }

  // Track which targets we've already decided to create stubs for
  const stubsToCreate = new Set<string>();
  // Track rewrites: target → corrected name (so we rewrite consistently)
  const rewriteMap = new Map<string, string>();

  // First pass: determine match vs create for each unique broken target
  const allBrokenTargets = new Set<string>();
  for (const bl of linkReport.brokenLinks) {
    allBrokenTargets.add(bl.target);
  }

  for (const target of allBrokenTargets) {
    const match = findBestMatch(target, fileNames);
    if (match) {
      rewriteMap.set(target, match);
    } else {
      stubsToCreate.add(target);
    }
  }

  // Second pass: generate actions per source file
  for (const [source, targets] of brokenBySource) {
    const sourceFile = files.find((f) => f.relativePath === source);
    if (!sourceFile) continue;

    let modified = sourceFile.content;
    let hasChanges = false;

    for (const target of targets) {
      const corrected = rewriteMap.get(target);
      if (corrected) {
        // Rewrite [[OldTarget]] → [[CorrectTarget]]
        // Handle both [[target]] and [[target|alias]] forms
        const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(
          `\\[\\[${escapedTarget}(\\|[^\\]]*)?\\]\\]`,
          "g"
        );
        const newContent = modified.replace(regex, (match, alias) => {
          return alias ? `[[${corrected}${alias}]]` : `[[${corrected}]]`;
        });
        if (newContent !== modified) {
          modified = newContent;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      actions.push({
        category: "links",
        description: `Rewrite broken wikilinks in ${source}: ${[...targets].filter((t) => rewriteMap.has(t)).map((t) => `[[${t}]] → [[${rewriteMap.get(t)}]]`).join(", ")}`,
        filePath: source,
        originalContent: sourceFile.content,
        newContent: modified,
        isCreate: false,
      });
    }
  }

  // Create stubs for unmatched targets
  for (const target of stubsToCreate) {
    const stubContent = `# ${target}\n\nTODO: Add content for ${target}.\n`;
    actions.push({
      category: "links",
      description: `Create stub file for broken link target: ${target}`,
      filePath: `${target}.md`,
      createContent: stubContent,
      isCreate: true,
    });
  }

  return actions;
}
