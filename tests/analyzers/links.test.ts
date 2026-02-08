import { describe, test, expect } from "bun:test";
import { join } from "path";
import { analyzeLinks } from "../../src/analyzers/links.js";
import { scanVault } from "../../src/scanner.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { VaultFile } from "../../src/types.js";

const HEALTHY_VAULT = join(import.meta.dir, "../fixtures/healthy-vault");
const UNHEALTHY_VAULT = join(import.meta.dir, "../fixtures/unhealthy-vault");

function makeFile(
  relativePath: string,
  wikilinks: string[] = []
): VaultFile {
  return {
    path: relativePath,
    relativePath,
    content: "",
    stats: { size: 100, mtime: new Date(), ctime: new Date() },
    wordCount: 50,
    wikilinks,
    frontmatter: null,
  };
}

describe("analyzeLinks", () => {
  test("counts total and unique links", () => {
    const files = [
      makeFile("A.md", ["B", "C", "B"]),
      makeFile("B.md", ["A"]),
      makeFile("C.md", []),
    ];

    const result = analyzeLinks(files);
    expect(result.totalLinks).toBe(4);
    expect(result.uniqueLinks).toBe(3);
  });

  test("finds broken links", () => {
    const files = [
      makeFile("A.md", ["B", "NonExistent"]),
      makeFile("B.md", ["A"]),
    ];

    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBe(1);
    expect(result.brokenLinks[0].target).toBe("NonExistent");
    expect(result.brokenLinks[0].source).toBe("A.md");
  });

  test("finds orphan files", () => {
    const files = [
      makeFile("A.md", ["B"]),
      makeFile("B.md", []),
      makeFile("Orphan.md", []),
    ];

    const result = analyzeLinks(files);
    expect(result.orphanFiles).toContain("A.md");
    expect(result.orphanFiles).toContain("Orphan.md");
    expect(result.orphanFiles).not.toContain("B.md");
  });

  test("calculates connectivity score", () => {
    const files = [
      makeFile("A.md", ["B"]),
      makeFile("B.md", ["A"]),
      makeFile("C.md", []),
    ];

    const result = analyzeLinks(files);
    // A and B are linked to, C is orphan
    // Connectivity = 2/3
    expect(result.connectivityScore).toBeCloseTo(2 / 3, 2);
  });

  test("handles empty vault", () => {
    const result = analyzeLinks([]);
    expect(result.totalLinks).toBe(0);
    expect(result.brokenLinks).toEqual([]);
    expect(result.orphanFiles).toEqual([]);
    expect(result.connectivityScore).toBe(0);
  });

  test("case-insensitive link matching", () => {
    const files = [
      makeFile("Alice.md", ["bob"]),
      makeFile("Bob.md", ["alice"]),
    ];

    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBe(0);
  });

  test("works with real healthy vault", async () => {
    const files = await scanVault(HEALTHY_VAULT, DEFAULT_CONFIG);
    const result = analyzeLinks(files);
    expect(result.totalLinks).toBeGreaterThan(0);
    expect(result.connectivityScore).toBeGreaterThan(0.5);
  });

  test("finds broken links in unhealthy vault", async () => {
    const files = await scanVault(UNHEALTHY_VAULT, DEFAULT_CONFIG);
    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBeGreaterThan(0);
  });
});
