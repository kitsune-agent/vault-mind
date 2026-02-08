import type { VaultFile, GrowthReport } from "../types.js";

const DAILY_LOG_REGEX = /^memory\/(\d{4}-\d{2}-\d{2})\.md$/;

function getWeekKey(date: Date): string {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  const week = Math.ceil(
    (diff / (1000 * 60 * 60 * 24) + startOfYear.getDay() + 1) / 7
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function analyzeGrowth(files: VaultFile[]): GrowthReport {
  const totalFiles = files.length;
  const totalWords = files.reduce((sum, f) => sum + f.wordCount, 0);
  const totalBytes = files.reduce((sum, f) => sum + f.stats.size, 0);

  // Daily log word count trend
  const dailyLogTrend: GrowthReport["dailyLogTrend"] = [];
  for (const file of files) {
    const match = file.relativePath.match(DAILY_LOG_REGEX);
    if (match) {
      dailyLogTrend.push({ date: match[1], wordCount: file.wordCount });
    }
  }
  dailyLogTrend.sort((a, b) => a.date.localeCompare(b.date));

  // Files created per week (using ctime)
  const weekCounts = new Map<string, number>();
  for (const file of files) {
    const week = getWeekKey(file.stats.ctime);
    weekCounts.set(week, (weekCounts.get(week) || 0) + 1);
  }
  const filesCreatedPerWeek = Array.from(weekCounts.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  // Entity file update frequency
  const entityUpdateFrequency: GrowthReport["entityUpdateFrequency"] = [];
  const now = new Date();
  for (const file of files) {
    if (file.relativePath.startsWith("bank/entities/")) {
      const days = Math.floor(
        (now.getTime() - file.stats.mtime.getTime()) / (1000 * 60 * 60 * 24)
      );
      entityUpdateFrequency.push({
        path: file.relativePath,
        daysSinceUpdate: days,
      });
    }
  }
  entityUpdateFrequency.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  return {
    totalFiles,
    totalWords,
    totalBytes,
    dailyLogTrend,
    filesCreatedPerWeek,
    entityUpdateFrequency,
  };
}
