import { describe, test, expect } from "bun:test";
import { generateFixPlan } from "../../src/fixers/index.js";
import { analyzeLinks } from "../../src/analyzers/links.js";
import { analyzeQuality } from "../../src/analyzers/quality.js";
import { DEFAULT_CONFIG } from "../../src/config.js";
import type { VaultFile } from "../../src/types.js";

function makeFile(
  relativePath: string,
  content: string,
  wikilinks: string[] = []
): VaultFile {
  return {
    path: relativePath,
    relativePath,
    content,
    stats: { size: content.length, mtime: new Date(), ctime: new Date() },
    wordCount: content.split(/\s+/).filter(Boolean).length,
    wikilinks,
    frontmatter: null,
  };
}

describe("generateFixPlan", () => {
  test("generates combined plan from all fixers", () => {
    const files = [
      makeFile(
        "A.md",
        "# File A\n\nLinks to [[Allice]] and [[NonExistent]].\n",
        ["Allice", "NonExistent"]
      ),
      makeFile(
        "Alice.md",
        "# Alice\n\nAlice is an engineer who works on important projects.\n",
        ["A"]
      ),
      makeFile(
        "Orphan.md",
        "# Orphan\n\nThis orphan file discusses Alice and engineering topics at length with enough content to match.\n",
        []
      ),
    ];

    const linkReport = analyzeLinks(files);
    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);
    const plan = generateFixPlan(files, linkReport, qualityReport);

    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.summary.totalFixes).toBe(plan.actions.length);
  });

  test("filters by category with --only", () => {
    const files = [
      makeFile(
        "A.md",
        "# File A\n\nLinks to [[Allice]].\n",
        ["Allice"]
      ),
      makeFile(
        "Alice.md",
        "# Alice\n\nAlice is an engineer.\n",
        []
      ),
    ];

    const linkReport = analyzeLinks(files);
    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);

    const linksOnly = generateFixPlan(files, linkReport, qualityReport, "links");
    const orphansOnly = generateFixPlan(files, linkReport, qualityReport, "orphans");

    // Links plan should have link fixes
    for (const action of linksOnly.actions) {
      expect(action.category).toBe("links");
    }

    // Orphans plan should not have link fixes
    for (const action of orphansOnly.actions) {
      expect(action.category).toBe("orphans");
    }
  });

  test("summary counts are accurate", () => {
    const files = [
      makeFile(
        "A.md",
        "# File A\n\nLinks to [[TotallyNew]] and some other stuff.\n",
        ["TotallyNew"]
      ),
      makeFile(
        "Bob.md",
        "# Bob\n\nBob is a product manager.\n",
        []
      ),
    ];

    const linkReport = analyzeLinks(files);
    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);
    const plan = generateFixPlan(files, linkReport, qualityReport);

    expect(plan.summary.filesToCreate).toBe(
      plan.actions.filter((a) => a.isCreate).length
    );
    expect(plan.summary.filesToModify).toBe(
      plan.actions.filter((a) => !a.isCreate).length
    );
    expect(plan.summary.totalFixes).toBe(
      plan.summary.linkFixes +
        plan.summary.orphanFixes +
        plan.summary.isolatedFixes
    );
  });

  test("handles clean vault with no issues", () => {
    const files = [
      makeFile(
        "A.md",
        "# File A\n\nLinks to [[B]].\n",
        ["B"]
      ),
      makeFile(
        "B.md",
        "# File B\n\nLinks to [[A]].\n",
        ["A"]
      ),
    ];

    const linkReport = analyzeLinks(files);
    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);
    const plan = generateFixPlan(files, linkReport, qualityReport);

    expect(plan.summary.totalFixes).toBe(0);
    expect(plan.actions.length).toBe(0);
  });
});
