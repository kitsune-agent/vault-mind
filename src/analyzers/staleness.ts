import type { VaultFile, VaultMindConfig, StalenessReport } from "../types.js";

const DAILY_LOG_REGEX = /^memory\/(\d{4}-\d{2}-\d{2})\.md$/;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function categorizeFile(relativePath: string): string {
  if (DAILY_LOG_REGEX.test(relativePath)) return "daily-log";
  if (relativePath.startsWith("bank/entities/")) return "entity";
  if (relativePath.startsWith("bank/projects/")) return "project";
  if (relativePath.startsWith("bank/")) return "bank";
  if (relativePath.startsWith("memory/")) return "memory";
  return "other";
}

export function analyzeStaleness(
  files: VaultFile[],
  config: VaultMindConfig,
  now: Date = new Date()
): StalenessReport {
  const staleFiles: StalenessReport["staleFiles"] = [];
  const staleCoreFiles: StalenessReport["staleCoreFiles"] = [];
  const dailyLogDates: string[] = [];

  for (const file of files) {
    const days = daysBetween(file.stats.mtime, now);
    const category = categorizeFile(file.relativePath);

    if (days >= config.staleness.warningDays) {
      staleFiles.push({
        path: file.relativePath,
        daysSinceUpdate: days,
        category,
      });
    }

    const baseName = file.relativePath.split("/").pop() || "";
    if (config.coreFiles.includes(baseName)) {
      if (days >= config.staleness.coreFileCriticalDays) {
        staleCoreFiles.push({
          path: file.relativePath,
          daysSinceUpdate: days,
        });
      }
    }

    const logMatch = file.relativePath.match(DAILY_LOG_REGEX);
    if (logMatch) {
      dailyLogDates.push(logMatch[1]);
    }
  }

  // Sort stale files by staleness (most stale first)
  staleFiles.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  // Find daily log gaps
  const sortedDates = dailyLogDates.sort();
  const gaps: string[] = [];
  let streak = 0;

  if (sortedDates.length > 0) {
    // Check for gaps between existing logs
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diff = daysBetween(prev, curr);
      if (diff > 1) {
        // Add missing dates
        for (let d = 1; d < diff; d++) {
          const missing = new Date(prev);
          missing.setDate(missing.getDate() + d);
          gaps.push(missing.toISOString().split("T")[0]);
        }
      }
    }

    // Calculate streak from most recent log
    const today = now.toISOString().split("T")[0];
    const lastLog = sortedDates[sortedDates.length - 1];

    // Check if today or yesterday has a log
    const lastLogDate = new Date(lastLog);
    const todayDate = new Date(today);
    const daysSinceLast = daysBetween(lastLogDate, todayDate);

    if (daysSinceLast <= 1) {
      streak = 1;
      for (let i = sortedDates.length - 2; i >= 0; i--) {
        const curr = new Date(sortedDates[i + 1]);
        const prev = new Date(sortedDates[i]);
        if (daysBetween(prev, curr) === 1) {
          streak++;
        } else {
          break;
        }
      }
    }
  }

  return {
    staleFiles,
    staleCoreFiles,
    dailyLogGaps: gaps,
    dailyLogStreak: streak,
    lastDailyLog: sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null,
  };
}
