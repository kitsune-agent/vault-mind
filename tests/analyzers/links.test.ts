import { describe, test, expect } from "bun:test";
import { join } from "path";
import { analyzeLinks, isStructuralPath } from "../../src/analyzers/links.js";
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
    const result = analyzeLinks(files, HEALTHY_VAULT);
    expect(result.totalLinks).toBeGreaterThan(0);
    expect(result.knowledgeConnectivity).toBeGreaterThan(0.5);
  });

  test("finds broken links in unhealthy vault", async () => {
    const files = await scanVault(UNHEALTHY_VAULT, DEFAULT_CONFIG);
    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBeGreaterThan(0);
  });
});

describe("section link resolution", () => {
  test("section links should NOT be counted as broken", () => {
    const files = [
      makeFile("TOOLS.md", ["AGENTS"]),
      makeFile("AGENTS.md", ["TOOLS#Model Configuration"]),
    ];

    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBe(0);
  });

  test("section links to non-existent files ARE broken", () => {
    const files = [
      makeFile("A.md", ["NonExistent#Some Section"]),
      makeFile("B.md", []),
    ];

    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBe(1);
    expect(result.brokenLinks[0].target).toBe("NonExistent#Some Section");
  });

  test("self-referencing section links are valid", () => {
    const files = [makeFile("A.md", ["#Section One"])];

    const result = analyzeLinks(files);
    // Self-reference section link (empty file part) should be valid
    // The # prefix means self-reference — but our regex captures without #
    // Actually [[#Section]] parses to target "#Section" — let's verify behavior
    expect(result.brokenLinks.length).toBe(0);
  });

  test("section links with nested # are handled", () => {
    const files = [
      makeFile("TOOLS.md", []),
      makeFile("A.md", ["TOOLS#Section#Subsection"]),
    ];

    const result = analyzeLinks(files);
    // Should split on FIRST # only: file = "TOOLS", section = "Section#Subsection"
    expect(result.brokenLinks.length).toBe(0);
  });

  test("section link targets still count for orphan tracking", () => {
    const files = [
      makeFile("A.md", ["TOOLS#Model Configuration"]),
      makeFile("TOOLS.md", []),
    ];

    const result = analyzeLinks(files);
    // TOOLS.md should NOT be an orphan because A.md links to it via section link
    expect(result.orphanFiles).not.toContain("TOOLS.md");
  });
});

describe("path-style link resolution", () => {
  test("path-style links matching vault files are valid", () => {
    const files = [
      makeFile("A.md", ["bank/opinions"]),
      makeFile("bank/opinions.md", []),
    ];

    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBe(0);
  });

  test("path-style links with .md extension are valid", () => {
    const files = [
      makeFile("A.md", ["bank/opinions.md"]),
      makeFile("bank/opinions.md", []),
    ];

    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBe(0);
  });

  test("path-style links are flagged as non-standard", () => {
    const files = [
      makeFile("A.md", ["bank/opinions"]),
      makeFile("bank/opinions.md", []),
    ];

    const result = analyzeLinks(files);
    expect(result.pathStyleLinks.length).toBe(1);
    expect(result.pathStyleLinks[0].target).toBe("bank/opinions");
    expect(result.pathStyleLinks[0].suggestedName).toBe("opinions");
  });

  test("non-existent path-style links are broken", () => {
    const files = [
      makeFile("A.md", ["bank/nonexistent"]),
      makeFile("B.md", []),
    ];

    const result = analyzeLinks(files);
    expect(result.brokenLinks.length).toBe(1);
  });
});

describe("orphan classification", () => {
  test("classifies structural orphans correctly", () => {
    const files = [
      makeFile("A.md", ["B"]),
      makeFile("B.md", []),
      makeFile("memory/2026-02-08.md", []),
      makeFile("reports/weekly.md", []),
      makeFile("templates/daily.md", []),
      makeFile("skills/coding/SKILL.md", []),
      makeFile("docs/guide.md", []),
      makeFile("research/topic.md", []),
    ];

    const result = analyzeLinks(files);
    // A is orphan (not linked to), B is linked, rest are structural orphans
    expect(result.structuralOrphans).toContain("memory/2026-02-08.md");
    expect(result.structuralOrphans).toContain("reports/weekly.md");
    expect(result.structuralOrphans).toContain("templates/daily.md");
    expect(result.structuralOrphans).toContain("skills/coding/SKILL.md");
    expect(result.structuralOrphans).toContain("docs/guide.md");
    expect(result.structuralOrphans).toContain("research/topic.md");
    expect(result.structuralOrphans.length).toBe(6);
  });

  test("classifies knowledge orphans correctly", () => {
    const files = [
      makeFile("A.md", ["B"]),
      makeFile("B.md", []),
      makeFile("bank/entities/Charlie.md", []),
      makeFile("RootDoc.md", []),
      makeFile("memory/log.md", []),
    ];

    const result = analyzeLinks(files);
    // A and RootDoc and bank/entities/Charlie are knowledge orphans
    // memory/log is structural
    expect(result.knowledgeOrphans).toContain("A.md");
    expect(result.knowledgeOrphans).toContain("bank/entities/Charlie.md");
    expect(result.knowledgeOrphans).toContain("RootDoc.md");
    expect(result.knowledgeOrphans).not.toContain("memory/log.md");
  });

  test("knowledge connectivity excludes structural files", () => {
    const files = [
      makeFile("A.md", ["B"]),
      makeFile("B.md", ["A"]),
      makeFile("memory/day1.md", []),
      makeFile("memory/day2.md", []),
      makeFile("memory/day3.md", []),
    ];

    const result = analyzeLinks(files);
    // Overall: 2 linked out of 5 = 40%
    expect(result.connectivityScore).toBeCloseTo(2 / 5, 2);
    // Knowledge: A and B are both linked, no knowledge orphans → 100%
    expect(result.knowledgeConnectivity).toBeCloseTo(1.0, 2);
  });

  test("all orphan files is union of structural and knowledge", () => {
    const files = [
      makeFile("A.md", ["B"]),
      makeFile("B.md", []),
      makeFile("memory/log.md", []),
      makeFile("Orphan.md", []),
    ];

    const result = analyzeLinks(files);
    expect(result.orphanFiles.length).toBe(
      result.structuralOrphans.length + result.knowledgeOrphans.length
    );
  });
});

describe("isStructuralPath", () => {
  test("identifies structural directories", () => {
    expect(isStructuralPath("memory/2026-02-08.md")).toBe(true);
    expect(isStructuralPath("reports/weekly.md")).toBe(true);
    expect(isStructuralPath("templates/daily.md")).toBe(true);
    expect(isStructuralPath("skills/coding/SKILL.md")).toBe(true);
    expect(isStructuralPath("docs/guide.md")).toBe(true);
    expect(isStructuralPath("research/topic.md")).toBe(true);
  });

  test("identifies non-structural paths", () => {
    expect(isStructuralPath("bank/entities/Alice.md")).toBe(false);
    expect(isStructuralPath("MEMORY.md")).toBe(false);
    expect(isStructuralPath("TOOLS.md")).toBe(false);
    expect(isStructuralPath("bank/opinions.md")).toBe(false);
  });
});
