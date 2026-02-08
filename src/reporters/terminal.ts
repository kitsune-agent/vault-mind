import chalk from "chalk";
import type { VaultScanResult } from "../types.js";

function section(title: string): string {
  return `\n${chalk.bold.cyan(`━━━ ${title} ━━━`)}\n`;
}

function bullet(text: string): string {
  return `  ${chalk.dim("•")} ${text}`;
}

export function renderTerminal(result: VaultScanResult): string {
  const lines: string[] = [];

  lines.push(
    chalk.bold.magenta("\n🧠 vault-mind scan report\n")
  );
  lines.push(bullet(`Vault: ${chalk.white(result.vaultPath)}`));
  lines.push(bullet(`Scanned: ${chalk.white(result.scanDate)}`));
  lines.push(
    bullet(
      `Files: ${chalk.white(String(result.growth.totalFiles))} | Words: ${chalk.white(String(result.growth.totalWords))} | Size: ${chalk.white(formatBytes(result.growth.totalBytes))}`
    )
  );

  // Staleness
  lines.push(section("Staleness"));
  if (result.staleness.staleCoreFiles.length > 0) {
    lines.push(chalk.red("  Core files needing attention:"));
    for (const f of result.staleness.staleCoreFiles) {
      lines.push(
        bullet(
          `${chalk.yellow(f.path)} — ${chalk.red(String(f.daysSinceUpdate) + " days")} since update`
        )
      );
    }
  } else {
    lines.push(chalk.green("  All core files are fresh"));
  }

  if (result.staleness.lastDailyLog) {
    lines.push(
      bullet(`Last daily log: ${chalk.white(result.staleness.lastDailyLog)}`)
    );
    lines.push(
      bullet(
        `Log streak: ${chalk.white(String(result.staleness.dailyLogStreak))} consecutive days`
      )
    );
  }
  if (result.staleness.dailyLogGaps.length > 0) {
    lines.push(
      chalk.yellow(
        `  ${result.staleness.dailyLogGaps.length} gap(s) in daily logs`
      )
    );
  }

  const staleCount = result.staleness.staleFiles.length;
  if (staleCount > 0) {
    lines.push(
      bullet(`${chalk.yellow(String(staleCount))} stale files (7+ days)`)
    );
    for (const f of result.staleness.staleFiles.slice(0, 5)) {
      lines.push(
        `    ${chalk.dim(f.path)} ${chalk.dim("(" + f.daysSinceUpdate + "d)")}`
      );
    }
    if (staleCount > 5) {
      lines.push(chalk.dim(`    ... and ${staleCount - 5} more`));
    }
  }

  // Link Health
  lines.push(section("Link Health"));
  lines.push(
    bullet(
      `Total links: ${chalk.white(String(result.links.totalLinks))} (${chalk.white(String(result.links.uniqueLinks))} unique)`
    )
  );
  lines.push(
    bullet(
      `Connectivity: ${colorScore(result.links.connectivityScore * 100)}%`
    )
  );

  if (result.links.brokenLinks.length > 0) {
    lines.push(
      chalk.red(
        `  ${result.links.brokenLinks.length} broken link(s):`
      )
    );
    for (const bl of result.links.brokenLinks.slice(0, 5)) {
      lines.push(
        `    ${chalk.dim(bl.source)} → ${chalk.red(bl.target)}`
      );
    }
  } else {
    lines.push(chalk.green("  No broken links"));
  }

  if (result.links.orphanFiles.length > 0) {
    lines.push(
      chalk.yellow(
        `  ${result.links.orphanFiles.length} orphan file(s) (not linked to):`
      )
    );
    for (const o of result.links.orphanFiles.slice(0, 5)) {
      lines.push(`    ${chalk.dim(o)}`);
    }
  }

  // Quality
  lines.push(section("Quality"));
  if (result.quality.stubs.length > 0) {
    lines.push(
      chalk.yellow(
        `  ${result.quality.stubs.length} stub(s) (<50 words)`
      )
    );
  }
  if (result.quality.oversized.length > 0) {
    lines.push(
      chalk.yellow(
        `  ${result.quality.oversized.length} oversized file(s) (>5000 words)`
      )
    );
  }
  if (result.quality.isolatedFiles.length > 0) {
    lines.push(
      chalk.yellow(
        `  ${result.quality.isolatedFiles.length} file(s) with no wikilinks`
      )
    );
  }
  if (result.quality.selfReview) {
    const sr = result.quality.selfReview;
    lines.push(
      bullet(
        `Self-review: ${chalk.green(String(sr.hits) + " HIT")} / ${chalk.red(String(sr.misses) + " MISS")} / ${chalk.blue(String(sr.fixes) + " FIX")}`
      )
    );
  }
  if (result.quality.duplicates.length > 0) {
    lines.push(
      chalk.red(
        `  ${result.quality.duplicates.length} duplicate(s) detected`
      )
    );
  }

  // Graph summary
  lines.push(section("Knowledge Graph"));
  if (result.graph.hubs.length > 0) {
    lines.push("  Hub files (most linked-to):");
    for (const hub of result.graph.hubs.slice(0, 5)) {
      lines.push(
        bullet(
          `${chalk.white(hub.id)} (${hub.incomingLinks} incoming links)`
        )
      );
    }
  }
  lines.push(
    bullet(`${result.graph.clusters.length} cluster(s) detected`)
  );
  if (result.graph.bridges.length > 0) {
    lines.push(
      bullet(
        `${result.graph.bridges.length} bridge file(s): ${result.graph.bridges.join(", ")}`
      )
    );
  }

  lines.push("");
  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function colorScore(score: number): string {
  if (score >= 80) return chalk.green(score.toFixed(0));
  if (score >= 60) return chalk.yellow(score.toFixed(0));
  return chalk.red(score.toFixed(0));
}
