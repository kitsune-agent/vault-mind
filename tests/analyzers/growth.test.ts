import { describe, test, expect } from "bun:test";
import { join } from "path";
import { analyzeGrowth } from "../../src/analyzers/growth.js";
import { scanVault } from "../../src/scanner.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { VaultFile } from "../../src/types.js";

const HEALTHY_VAULT = join(import.meta.dir, "../fixtures/healthy-vault");

function makeFile(
  relativePath: string,
  wordCount: number,
  mtime: Date = new Date(),
  ctime: Date = new Date()
): VaultFile {
  return {
    path: relativePath,
    relativePath,
    content: "x ".repeat(wordCount),
    stats: { size: wordCount * 5, mtime, ctime },
    wordCount,
    wikilinks: [],
    frontmatter: null,
  };
}

describe("analyzeGrowth", () => {
  test("counts total files, words, and bytes", () => {
    const files = [
      makeFile("A.md", 100),
      makeFile("B.md", 200),
      makeFile("C.md", 300),
    ];

    const result = analyzeGrowth(files);
    expect(result.totalFiles).toBe(3);
    expect(result.totalWords).toBe(600);
    expect(result.totalBytes).toBe(3000);
  });

  test("builds daily log trend", () => {
    const files = [
      makeFile("memory/2026-02-06.md", 150),
      makeFile("memory/2026-02-07.md", 200),
      makeFile("memory/2026-02-08.md", 180),
    ];

    const result = analyzeGrowth(files);
    expect(result.dailyLogTrend.length).toBe(3);
    expect(result.dailyLogTrend[0].date).toBe("2026-02-06");
    expect(result.dailyLogTrend[0].wordCount).toBe(150);
  });

  test("groups files created per week", () => {
    const files = [
      makeFile("A.md", 100, new Date(), new Date("2026-02-03")),
      makeFile("B.md", 100, new Date(), new Date("2026-02-04")),
      makeFile("C.md", 100, new Date(), new Date("2026-01-20")),
    ];

    const result = analyzeGrowth(files);
    expect(result.filesCreatedPerWeek.length).toBeGreaterThanOrEqual(1);
  });

  test("tracks entity update frequency", () => {
    const files = [
      makeFile(
        "bank/entities/Alice.md",
        100,
        new Date("2026-02-01")
      ),
      makeFile(
        "bank/entities/Bob.md",
        100,
        new Date("2026-01-15")
      ),
      makeFile("MEMORY.md", 100), // Not an entity
    ];

    const result = analyzeGrowth(files);
    expect(result.entityUpdateFrequency.length).toBe(2);
    // Bob should be first (more stale)
    expect(result.entityUpdateFrequency[0].path).toBe(
      "bank/entities/Bob.md"
    );
  });

  test("handles empty vault", () => {
    const result = analyzeGrowth([]);
    expect(result.totalFiles).toBe(0);
    expect(result.totalWords).toBe(0);
    expect(result.dailyLogTrend).toEqual([]);
  });

  test("works with real vault", async () => {
    const files = await scanVault(HEALTHY_VAULT, DEFAULT_CONFIG);
    const result = analyzeGrowth(files);
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(result.totalWords).toBeGreaterThan(0);
    expect(result.dailyLogTrend.length).toBeGreaterThan(0);
  });
});
