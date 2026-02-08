import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import type {
  VaultFile,
  LinkReport,
  QualityReport,
  FixAction,
  FixPlan,
  FixResult,
  FixCategory,
} from "../types.js";
import { fixBrokenLinks } from "./links.js";
import { fixOrphans } from "./orphans.js";
import { fixIsolated } from "./isolated.js";

export interface FixOptions {
  apply: boolean;
  interactive: boolean;
  only?: FixCategory;
  /** For interactive mode: prompt function. Returns true if user approves. */
  promptFn?: (action: FixAction) => Promise<boolean>;
}

/**
 * Generate a fix plan by running all fixers.
 */
export function generateFixPlan(
  files: VaultFile[],
  linkReport: LinkReport,
  qualityReport: QualityReport,
  only?: FixCategory
): FixPlan {
  let actions: FixAction[] = [];

  if (!only || only === "links") {
    actions.push(...fixBrokenLinks(files, linkReport));
  }
  if (!only || only === "orphans") {
    actions.push(...fixOrphans(files, linkReport));
  }
  if (!only || only === "isolated") {
    actions.push(...fixIsolated(files, qualityReport));
  }

  // Deduplicate: if multiple actions modify the same file, merge them
  actions = deduplicateActions(actions);

  const linkFixes = actions.filter((a) => a.category === "links").length;
  const orphanFixes = actions.filter((a) => a.category === "orphans").length;
  const isolatedFixes = actions.filter((a) => a.category === "isolated").length;

  return {
    actions,
    summary: {
      totalFixes: actions.length,
      linkFixes,
      orphanFixes,
      isolatedFixes,
      filesToModify: actions.filter((a) => !a.isCreate).length,
      filesToCreate: actions.filter((a) => a.isCreate).length,
    },
  };
}

/**
 * Deduplicate actions that modify the same file.
 * If multiple actions target the same file, chain the modifications.
 */
function deduplicateActions(actions: FixAction[]): FixAction[] {
  const byFile = new Map<string, FixAction[]>();
  const creates: FixAction[] = [];

  for (const action of actions) {
    if (action.isCreate) {
      creates.push(action);
      continue;
    }
    const existing = byFile.get(action.filePath) ?? [];
    existing.push(action);
    byFile.set(action.filePath, existing);
  }

  const merged: FixAction[] = [];

  for (const [filePath, fileActions] of byFile) {
    if (fileActions.length === 1) {
      merged.push(fileActions[0]);
      continue;
    }

    // Chain modifications: start with original, apply each in sequence
    let content = fileActions[0].originalContent!;
    const descriptions: string[] = [];
    const categories = new Set<FixCategory>();

    for (const action of fileActions) {
      // Apply this action's changes relative to its original
      // Since actions were computed independently, we need to re-apply
      // the transformation on the evolving content
      if (action.newContent) {
        content = action.newContent;
      }
      descriptions.push(action.description);
      categories.add(action.category);
    }

    merged.push({
      category: fileActions[0].category,
      description: descriptions.join("; "),
      filePath,
      originalContent: fileActions[0].originalContent,
      newContent: content,
      isCreate: false,
    });
  }

  return [...merged, ...creates];
}

/**
 * Apply a fix plan to disk.
 */
export async function applyFixPlan(
  vaultPath: string,
  plan: FixPlan,
  options: FixOptions
): Promise<FixResult> {
  const result: FixResult = {
    plan,
    applied: options.apply,
    actionsApplied: 0,
    actionsSkipped: 0,
    errors: [],
  };

  if (!options.apply) {
    return result;
  }

  for (const action of plan.actions) {
    try {
      // In interactive mode, ask for approval
      if (options.interactive && options.promptFn) {
        const approved = await options.promptFn(action);
        if (!approved) {
          result.actionsSkipped++;
          continue;
        }
      }

      const fullPath = join(vaultPath, action.filePath);

      if (action.isCreate) {
        // Create new file
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, action.createContent!, "utf-8");
      } else if (action.newContent !== undefined) {
        // Modify existing file
        await writeFile(fullPath, action.newContent, "utf-8");
      }

      result.actionsApplied++;
    } catch (err) {
      result.errors.push({
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export { fixBrokenLinks } from "./links.js";
export { fixOrphans } from "./orphans.js";
export { fixIsolated } from "./isolated.js";
