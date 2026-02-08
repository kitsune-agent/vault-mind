import { describe, test, expect } from "bun:test";
import { join } from "path";
import { analyzeQuality } from "../../src/analyzers/quality.js";
import { scanVault } from "../../src/scanner.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { VaultFile } from "../../src/types.js";

const HEALTHY_VAULT = join(import.meta.dir, "../fixtures/healthy-vault");
const UNHEALTHY_VAULT = join(import.meta.dir, "../fixtures/unhealthy-vault");

function makeFile(overrides: Partial<VaultFile> & { relativePath: string }): VaultFile {
  return {
    path: overrides.relativePath,
    relativePath: overrides.relativePath,
    content: overrides.content || "word ".repeat(100),
    stats: overrides.stats || { size: 500, mtime: new Date(), ctime: new Date() },
    wordCount: overrides.wordCount ?? 100,
    wikilinks: overrides.wikilinks || ["SomeLink"],
    frontmatter: overrides.frontmatter || null,
  };
}

describe("analyzeQuality", () => {
  test("identifies stubs (<50 words)", () => {
    const files = [
      makeFile({ relativePath: "stub.md", wordCount: 10 }),
      makeFile({ relativePath: "normal.md", wordCount: 100 }),
    ];

    const result = analyzeQuality(files, DEFAULT_CONFIG);
    expect(result.stubs).toEqual(["stub.md"]);
  });

  test("identifies oversized files (>5000 words)", () => {
    const files = [
      makeFile({ relativePath: "huge.md", wordCount: 6000 }),
      makeFile({ relativePath: "normal.md", wordCount: 100 }),
    ];

    const result = analyzeQuality(files, DEFAULT_CONFIG);
    expect(result.oversized).toEqual(["huge.md"]);
  });

  test("identifies isolated files (no wikilinks)", () => {
    const files = [
      makeFile({ relativePath: "isolated.md", wikilinks: [] }),
      makeFile({ relativePath: "connected.md", wikilinks: ["Other"] }),
    ];

    const result = analyzeQuality(files, DEFAULT_CONFIG);
    expect(result.isolatedFiles).toEqual(["isolated.md"]);
  });

  test("parses self-review HIT/MISS/FIX", () => {
    const files = [
      makeFile({
        relativePath: "memory/self-review.md",
        content: "HIT: good\nMISS: bad\nMISS: also bad\nFIX: corrected\nHIT: another",
      }),
    ];

    const result = analyzeQuality(files, DEFAULT_CONFIG);
    expect(result.selfReview).toEqual({ hits: 2, misses: 2, fixes: 1 });
  });

  test("detects duplicate content", () => {
    const content = "This is duplicate content that appears in two different files in the vault system for testing purposes only right now.";
    const files = [
      makeFile({ relativePath: "dup1.md", content, wordCount: 20 }),
      makeFile({ relativePath: "dup2.md", content, wordCount: 20 }),
    ];

    const result = analyzeQuality(files, DEFAULT_CONFIG);
    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].file1).toBe("dup1.md");
    expect(result.duplicates[0].file2).toBe("dup2.md");
  });

  test("no duplicates for unique files", () => {
    const files = [
      makeFile({ relativePath: "a.md", content: "unique content one here", wordCount: 20 }),
      makeFile({ relativePath: "b.md", content: "different content two here", wordCount: 20 }),
    ];

    const result = analyzeQuality(files, DEFAULT_CONFIG);
    expect(result.duplicates.length).toBe(0);
  });

  test("handles empty vault", () => {
    const result = analyzeQuality([], DEFAULT_CONFIG);
    expect(result.stubs).toEqual([]);
    expect(result.oversized).toEqual([]);
    expect(result.selfReview).toBeNull();
  });

  test("works with real healthy vault", async () => {
    const files = await scanVault(HEALTHY_VAULT, DEFAULT_CONFIG);
    const result = analyzeQuality(files, DEFAULT_CONFIG);
    expect(result.selfReview).not.toBeNull();
    expect(result.selfReview!.hits).toBeGreaterThan(0);
  });

  test("finds issues in unhealthy vault", async () => {
    const files = await scanVault(UNHEALTHY_VAULT, DEFAULT_CONFIG);
    const result = analyzeQuality(files, DEFAULT_CONFIG);
    expect(result.stubs.length).toBeGreaterThan(0);
    expect(result.duplicates.length).toBeGreaterThan(0);
  });
});
