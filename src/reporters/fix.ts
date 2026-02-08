import chalk from "chalk";
import type { FixPlan, FixResult, FixAction } from "../types.js";

/**
 * Render a fix plan for dry-run output (terminal).
 */
export function renderFixPlanTerminal(plan: FixPlan): string {
  const lines: string[] = [];

  lines.push(chalk.bold.magenta("\n🔧 vault-mind fix plan\n"));

  if (plan.actions.length === 0) {
    lines.push(chalk.green("  ✓ No fixes needed! Vault is in good shape.\n"));
    return lines.join("\n");
  }

  lines.push(
    chalk.dim(
      `  ${plan.summary.totalFixes} fix(es) proposed: ` +
      `${plan.summary.linkFixes} link, ` +
      `${plan.summary.orphanFixes} orphan, ` +
      `${plan.summary.isolatedFixes} isolated\n`
    )
  );

  // Group by category
  const byCategory = new Map<string, FixAction[]>();
  for (const action of plan.actions) {
    const existing = byCategory.get(action.category) ?? [];
    existing.push(action);
    byCategory.set(action.category, existing);
  }

  const categoryLabels: Record<string, { icon: string; title: string; color: (s: string) => string }> = {
    links: { icon: "🔗", title: "Broken Links", color: chalk.red },
    orphans: { icon: "👻", title: "Orphan Files", color: chalk.yellow },
    isolated: { icon: "🏝️", title: "Isolated Files", color: chalk.blue },
  };

  for (const [category, actions] of byCategory) {
    const { icon, title, color } = categoryLabels[category] ?? {
      icon: "•",
      title: category,
      color: chalk.white,
    };

    lines.push(color(`  ${icon} ${title} (${actions.length})\n`));

    for (const action of actions) {
      const actionIcon = action.isCreate ? chalk.green("+") : chalk.yellow("~");
      lines.push(`    ${actionIcon} ${action.description}`);

      if (action.isCreate) {
        lines.push(chalk.dim(`      → Create: ${action.filePath}`));
      } else {
        lines.push(chalk.dim(`      → Modify: ${action.filePath}`));
      }
    }
    lines.push("");
  }

  lines.push(
    chalk.dim(
      `  Files to modify: ${plan.summary.filesToModify} | ` +
      `Files to create: ${plan.summary.filesToCreate}`
    )
  );
  lines.push(
    chalk.dim("\n  Run with --apply to execute these fixes.\n")
  );

  return lines.join("\n");
}

/**
 * Render a fix result after applying (terminal).
 */
export function renderFixResultTerminal(result: FixResult): string {
  const lines: string[] = [];

  lines.push(chalk.bold.magenta("\n🔧 vault-mind fix results\n"));

  if (!result.applied) {
    lines.push(chalk.yellow("  ⚠ Dry run — no changes were made.\n"));
    lines.push(renderFixPlanTerminal(result.plan));
    return lines.join("\n");
  }

  lines.push(
    chalk.green(`  ✓ Applied ${result.actionsApplied} fix(es)`)
  );

  if (result.actionsSkipped > 0) {
    lines.push(
      chalk.yellow(`  ⊘ Skipped ${result.actionsSkipped} fix(es)`)
    );
  }

  if (result.errors.length > 0) {
    lines.push(chalk.red(`\n  ✗ ${result.errors.length} error(s):\n`));
    for (const { action, error } of result.errors) {
      lines.push(chalk.red(`    • ${action.filePath}: ${error}`));
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Render fix plan as JSON.
 */
export function renderFixPlanJson(plan: FixPlan): string {
  return JSON.stringify(
    {
      summary: plan.summary,
      actions: plan.actions.map((a) => ({
        category: a.category,
        description: a.description,
        filePath: a.filePath,
        isCreate: a.isCreate,
      })),
    },
    null,
    2
  );
}

/**
 * Render fix result as JSON.
 */
export function renderFixResultJson(result: FixResult): string {
  return JSON.stringify(
    {
      applied: result.applied,
      actionsApplied: result.actionsApplied,
      actionsSkipped: result.actionsSkipped,
      errors: result.errors.map((e) => ({
        filePath: e.action.filePath,
        error: e.error,
      })),
      plan: {
        summary: result.plan.summary,
        actions: result.plan.actions.map((a) => ({
          category: a.category,
          description: a.description,
          filePath: a.filePath,
          isCreate: a.isCreate,
        })),
      },
    },
    null,
    2
  );
}

/**
 * Render fix plan as markdown.
 */
export function renderFixPlanMarkdown(plan: FixPlan): string {
  const lines: string[] = [];

  lines.push("# Vault Mind Fix Plan\n");

  if (plan.actions.length === 0) {
    lines.push("✅ No fixes needed! Vault is in good shape.\n");
    return lines.join("\n");
  }

  lines.push(
    `**Total fixes:** ${plan.summary.totalFixes} ` +
    `(${plan.summary.linkFixes} links, ` +
    `${plan.summary.orphanFixes} orphans, ` +
    `${plan.summary.isolatedFixes} isolated)\n`
  );

  lines.push(
    `**Files to modify:** ${plan.summary.filesToModify} | ` +
    `**Files to create:** ${plan.summary.filesToCreate}\n`
  );

  const categoryLabels: Record<string, string> = {
    links: "🔗 Broken Links",
    orphans: "👻 Orphan Files",
    isolated: "🏝️ Isolated Files",
  };

  // Group by category
  const byCategory = new Map<string, FixAction[]>();
  for (const action of plan.actions) {
    const existing = byCategory.get(action.category) ?? [];
    existing.push(action);
    byCategory.set(action.category, existing);
  }

  for (const [category, actions] of byCategory) {
    lines.push(`## ${categoryLabels[category] ?? category}\n`);
    for (const action of actions) {
      const icon = action.isCreate ? "➕" : "✏️";
      lines.push(`- ${icon} ${action.description}`);
      lines.push(`  - File: \`${action.filePath}\``);
    }
    lines.push("");
  }

  lines.push("---\n*Run with `--apply` to execute these fixes.*");
  return lines.join("\n");
}
