import { describe, test, expect } from "bun:test";
import { join } from "path";
import { analyzeStaleness } from "../../src/analyzers/staleness.js";
import { scanVault } from "../../src/scanner.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { VaultFile } from "../../src/types.js";

const HEALTHY_VAULT = join(import.meta.dir, "../fixtures/healthy-vault");
const UNHEALTHY_VAULT = join(import.meta.dir, "../fixtures/unhealthy-vault");

function makeFile(overrides: Partial<VaultFile> & { relativePath: string }): VaultFile {
  return {
    path: overrides.relativePath,
    relativePath: overrides.relativePath,
    content: overrides.content || "Some content here for the test file with enough words",
    stats: overrides.stats || {
      size: 100,
      mtime: new Date(),
      ctime: new Date(),
    },
    wordCount: overrides.wordCount || 50,
    wikilinks: overrides.wikilinks || [],
    frontmatter: overrides.frontmatter || null,
  };
}

describe("analyzeStaleness", () => {
  test("detects stale core files", () => {
    const now = new Date("2026-02-08");
    const files = [
      makeFile({
        relativePath: "MEMORY.md",
        stats: { size: 100, mtime: new Date("2025-12-01"), ctime: new Date("2025-12-01") },
      }),
      makeFile({
        relativePath: "SOUL.md",
        stats: { size: 100, mtime: new Date("2026-02-07"), ctime: new Date("2026-01-01") },
      }),
    ];

    const result = analyzeStaleness(files, DEFAULT_CONFIG, now);
    expect(result.staleCoreFiles.length).toBe(1);
    expect(result.staleCoreFiles[0].path).toBe("MEMORY.md");
  });

  test("finds daily log gaps", () => {
    const now = new Date("2026-02-08");
    const files = [
      makeFile({
        relativePath: "memory/2026-02-01.md",
        stats: { size: 100, mtime: new Date("2026-02-01"), ctime: new Date("2026-02-01") },
      }),
      makeFile({
        relativePath: "memory/2026-02-03.md",
        stats: { size: 100, mtime: new Date("2026-02-03"), ctime: new Date("2026-02-03") },
      }),
    ];

    const result = analyzeStaleness(files, DEFAULT_CONFIG, now);
    expect(result.dailyLogGaps).toContain("2026-02-02");
  });

  test("calculates daily log streak", () => {
    const now = new Date("2026-02-08");
    const files = [
      makeFile({
        relativePath: "memory/2026-02-06.md",
        stats: { size: 100, mtime: new Date("2026-02-06"), ctime: new Date("2026-02-06") },
      }),
      makeFile({
        relativePath: "memory/2026-02-07.md",
        stats: { size: 100, mtime: new Date("2026-02-07"), ctime: new Date("2026-02-07") },
      }),
      makeFile({
        relativePath: "memory/2026-02-08.md",
        stats: { size: 100, mtime: new Date("2026-02-08"), ctime: new Date("2026-02-08") },
      }),
    ];

    const result = analyzeStaleness(files, DEFAULT_CONFIG, now);
    expect(result.dailyLogStreak).toBe(3);
  });

  test("identifies last daily log", () => {
    const files = [
      makeFile({ relativePath: "memory/2026-01-10.md" }),
      makeFile({ relativePath: "memory/2026-01-13.md" }),
    ];

    const result = analyzeStaleness(files, DEFAULT_CONFIG);
    expect(result.lastDailyLog).toBe("2026-01-13");
  });

  test("handles vault with no daily logs", () => {
    const files = [makeFile({ relativePath: "MEMORY.md" })];
    const result = analyzeStaleness(files, DEFAULT_CONFIG);
    expect(result.lastDailyLog).toBeNull();
    expect(result.dailyLogStreak).toBe(0);
    expect(result.dailyLogGaps).toEqual([]);
  });

  test("works with real healthy vault", async () => {
    const files = await scanVault(HEALTHY_VAULT, DEFAULT_CONFIG);
    const result = analyzeStaleness(files, DEFAULT_CONFIG);
    expect(result.lastDailyLog).not.toBeNull();
  });

  test("works with real unhealthy vault", async () => {
    const files = await scanVault(UNHEALTHY_VAULT, DEFAULT_CONFIG);
    const result = analyzeStaleness(files, DEFAULT_CONFIG);
    // Unhealthy vault has gaps
    expect(result.dailyLogGaps.length).toBeGreaterThan(0);
  });
});
