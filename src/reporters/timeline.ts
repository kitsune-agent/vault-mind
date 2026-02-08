import chalk from "chalk";
import type { VaultFile } from "../types.js";

interface DayActivity {
  date: string;
  files: string[];
  totalWords: number;
}

export function renderTimeline(files: VaultFile[]): string {
  // Group files by modification date
  const dayMap = new Map<string, DayActivity>();

  for (const file of files) {
    const date = file.stats.mtime.toISOString().split("T")[0];
    const day = dayMap.get(date) || { date, files: [], totalWords: 0 };
    day.files.push(file.relativePath);
    day.totalWords += file.wordCount;
    dayMap.set(date, day);
  }

  const days = Array.from(dayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  if (days.length === 0) return "No files found.";

  const lines: string[] = [];
  lines.push(chalk.bold.magenta("\n📅 vault-mind timeline\n"));

  // Find max for scaling the bar
  const maxFiles = Math.max(...days.map((d) => d.files.length));

  // Show last 30 days (or all if fewer)
  const recentDays = days.slice(-30);

  for (const day of recentDays) {
    const barLength = Math.ceil((day.files.length / maxFiles) * 30);
    const bar = "█".repeat(barLength);
    const color =
      day.files.length >= 5
        ? chalk.green
        : day.files.length >= 2
          ? chalk.yellow
          : chalk.dim;

    lines.push(
      `  ${chalk.white(day.date)} ${color(bar)} ${chalk.dim(String(day.files.length) + " files, " + day.totalWords + " words")}`
    );
  }

  // Weekly heatmap
  lines.push(chalk.bold.cyan("\n\n━━━ Weekly Activity ━━━\n"));
  const weekMap = new Map<string, number>();
  for (const day of days) {
    const d = new Date(day.date);
    const year = d.getFullYear();
    const week = getWeekNumber(d);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    weekMap.set(key, (weekMap.get(key) || 0) + day.files.length);
  }

  const weeks = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12);

  const maxWeekly = Math.max(...weeks.map(([, c]) => c));
  for (const [week, count] of weeks) {
    const barLength = Math.ceil((count / maxWeekly) * 25);
    const bar = "▓".repeat(barLength);
    lines.push(
      `  ${chalk.white(week)} ${chalk.cyan(bar)} ${chalk.dim(String(count))}`
    );
  }

  // Busiest areas
  lines.push(chalk.bold.cyan("\n\n━━━ Busiest Areas ━━━\n"));
  const areaCounts = new Map<string, number>();
  for (const file of files) {
    const parts = file.relativePath.split("/");
    const area = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
    areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
  }

  const sortedAreas = Array.from(areaCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  for (const [area, count] of sortedAreas) {
    lines.push(`  ${chalk.white(area)}: ${chalk.cyan(String(count))} files`);
  }

  lines.push("");
  return lines.join("\n");
}

function getWeekNumber(d: Date): number {
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - startOfYear.getTime();
  return Math.ceil((diff / (1000 * 60 * 60 * 24) + startOfYear.getDay() + 1) / 7);
}
