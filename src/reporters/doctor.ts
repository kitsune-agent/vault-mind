import chalk from "chalk";
import type { VaultScanResult, DoctorReport, CachedScan } from "../types.js";

function calculateScore(result: VaultScanResult): number {
  let score = 100;

  // Staleness penalties
  score -= result.staleness.staleCoreFiles.length * 10;
  score -= Math.min(result.staleness.staleFiles.length * 2, 20);
  score -= Math.min(result.staleness.dailyLogGaps.length * 3, 15);

  // Link health penalties
  score -= result.links.brokenLinks.length * 5;
  score -= Math.min(result.links.orphanFiles.length * 2, 15);
  if (result.links.connectivityScore < 0.5) {
    score -= 10;
  }

  // Quality penalties
  score -= Math.min(result.quality.stubs.length * 2, 10);
  score -= Math.min(result.quality.oversized.length * 3, 10);
  score -= result.quality.duplicates.length * 5;

  // Bonuses
  if (result.staleness.dailyLogStreak >= 7) score += 5;
  if (result.links.connectivityScore >= 0.8) score += 5;
  if (result.quality.selfReview) {
    const sr = result.quality.selfReview;
    if (sr.hits > sr.misses) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function generateDoctorReport(
  result: VaultScanResult,
  previousScan: CachedScan | null
): DoctorReport {
  const score = calculateScore(result);
  const grade = scoreToGrade(score);
  const issues: DoctorReport["issues"] = [];

  // Generate issues
  for (const core of result.staleness.staleCoreFiles) {
    issues.push({
      severity: "critical",
      message: `Core file ${core.path} hasn't been updated in ${core.daysSinceUpdate} days`,
      fix: `Review and update ${core.path} to reflect current state`,
    });
  }

  if (result.links.brokenLinks.length > 0) {
    issues.push({
      severity: "critical",
      message: `${result.links.brokenLinks.length} broken wikilink(s) found`,
      fix: `Create missing files or fix link targets: ${result.links.brokenLinks.slice(0, 3).map((l) => l.target).join(", ")}`,
    });
  }

  if (result.quality.duplicates.length > 0) {
    issues.push({
      severity: "warning",
      message: `${result.quality.duplicates.length} duplicate file(s) detected`,
      fix: `Review and consolidate: ${result.quality.duplicates.map((d) => d.file2).join(", ")}`,
    });
  }

  if (result.staleness.dailyLogGaps.length > 0) {
    issues.push({
      severity: "warning",
      message: `${result.staleness.dailyLogGaps.length} gap(s) in daily logs`,
      fix: `Ensure daily logs are written consistently`,
    });
  }

  if (result.links.orphanFiles.length > 3) {
    issues.push({
      severity: "warning",
      message: `${result.links.orphanFiles.length} orphan files not linked from anywhere`,
      fix: `Add wikilinks to orphan files from relevant documents`,
    });
  }

  if (result.quality.stubs.length > 3) {
    issues.push({
      severity: "info",
      message: `${result.quality.stubs.length} stub files with <50 words`,
      fix: `Flesh out stub files with more content or remove if unnecessary`,
    });
  }

  if (result.quality.isolatedFiles.length > 3) {
    issues.push({
      severity: "info",
      message: `${result.quality.isolatedFiles.length} files contain no wikilinks`,
      fix: `Add cross-references to connect isolated knowledge`,
    });
  }

  if (result.links.connectivityScore < 0.5) {
    issues.push({
      severity: "warning",
      message: `Low connectivity score: ${(result.links.connectivityScore * 100).toFixed(0)}%`,
      fix: `Increase cross-linking between files to improve knowledge navigation`,
    });
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Comparison with previous scan
  let comparison: DoctorReport["comparison"] = null;
  if (previousScan) {
    const previousIssueMessages = new Set(
      previousScan.issues.map((i) => i.message)
    );
    const currentIssueMessages = new Set(issues.map((i) => i.message));

    let newIssues = 0;
    for (const msg of currentIssueMessages) {
      if (!previousIssueMessages.has(msg)) newIssues++;
    }
    let resolvedIssues = 0;
    for (const msg of previousIssueMessages) {
      if (!currentIssueMessages.has(msg)) resolvedIssues++;
    }

    comparison = {
      previousScore: previousScan.score,
      scoreDelta: score - previousScan.score,
      newIssues,
      resolvedIssues,
    };
  }

  // Build summary
  const topIssues = issues
    .slice(0, 3)
    .map((i) => i.message)
    .join("; ");
  const summary = `Vault health: ${grade} (${score}/100). ${issues.length} issue(s). ${topIssues || "Looking good!"}`;

  return { grade, score, issues, summary, comparison };
}

export function renderDoctorTerminal(report: DoctorReport): string {
  const lines: string[] = [];

  const gradeColor =
    report.grade === "A"
      ? chalk.green
      : report.grade === "B"
        ? chalk.cyan
        : report.grade === "C"
          ? chalk.yellow
          : chalk.red;

  lines.push(
    chalk.bold.magenta("\n🩺 vault-mind doctor report\n")
  );
  lines.push(
    `  Grade: ${gradeColor.bold(report.grade)} (${report.score}/100)\n`
  );

  if (report.comparison) {
    const delta = report.comparison.scoreDelta!;
    const arrow = delta > 0 ? chalk.green("↑") : delta < 0 ? chalk.red("↓") : chalk.dim("→");
    lines.push(
      `  Compared to last scan: ${arrow} ${delta > 0 ? "+" : ""}${delta} points`
    );
    lines.push(
      `  New issues: ${report.comparison.newIssues} | Resolved: ${report.comparison.resolvedIssues}\n`
    );
  }

  if (report.issues.length > 0) {
    lines.push(chalk.bold("  Top issues:\n"));
    for (const issue of report.issues.slice(0, 5)) {
      const icon =
        issue.severity === "critical"
          ? chalk.red("✗")
          : issue.severity === "warning"
            ? chalk.yellow("!")
            : chalk.blue("i");
      lines.push(`  ${icon} ${issue.message}`);
      lines.push(chalk.dim(`    → ${issue.fix}`));
    }
  } else {
    lines.push(chalk.green("  No issues found! Your vault is in great shape."));
  }

  lines.push(`\n${chalk.dim("  Summary: " + report.summary)}\n`);

  return lines.join("\n");
}

export function renderDoctorMarkdown(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push("# Vault Mind Doctor Report\n");
  lines.push(`**Grade**: ${report.grade} (${report.score}/100)\n`);

  if (report.comparison) {
    const delta = report.comparison.scoreDelta!;
    lines.push(
      `**Change**: ${delta > 0 ? "+" : ""}${delta} points from last scan`
    );
    lines.push(
      `**New issues**: ${report.comparison.newIssues} | **Resolved**: ${report.comparison.resolvedIssues}\n`
    );
  }

  if (report.issues.length > 0) {
    lines.push("## Issues\n");
    for (const issue of report.issues) {
      const icon =
        issue.severity === "critical"
          ? "🔴"
          : issue.severity === "warning"
            ? "🟡"
            : "🔵";
      lines.push(`${icon} **${issue.message}**`);
      lines.push(`  - Fix: ${issue.fix}\n`);
    }
  }

  lines.push(`\n---\n${report.summary}`);
  return lines.join("\n");
}

export { calculateScore, scoreToGrade };
