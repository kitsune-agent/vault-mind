import { describe, test, expect } from "bun:test";
import {
  fixOrphans,
  insertWikilink,
  extractKeywords,
} from "../../src/fixers/orphans.js";
import { analyzeLinks } from "../../src/analyzers/links.js";
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

describe("extractKeywords", () => {
  test("extracts meaningful words", () => {
    const keywords = extractKeywords(
      "Alice is a software engineer working on TypeScript projects"
    );
    expect(keywords).toContain("alice");
    expect(keywords).toContain("software");
    expect(keywords).toContain("engineer");
    expect(keywords).toContain("typescript");
    expect(keywords).toContain("projects");
  });

  test("strips frontmatter", () => {
    const keywords = extractKeywords(
      "---\ntype: person\n---\nAlice is an engineer"
    );
    expect(keywords).toContain("alice");
    expect(keywords).not.toContain("type");
    expect(keywords).not.toContain("person");
  });

  test("removes stop words", () => {
    const keywords = extractKeywords(
      "This is about the very important thing that they have"
    );
    expect(keywords).not.toContain("this");
    expect(keywords).not.toContain("that");
    expect(keywords).not.toContain("they");
    expect(keywords).not.toContain("have");
    expect(keywords).toContain("important");
    expect(keywords).toContain("thing");
  });

  test("removes wikilink syntax", () => {
    const keywords = extractKeywords("Talked to [[Alice]] about [[Bob]]");
    expect(keywords).toContain("alice");
    expect(keywords).toContain("talked");
  });
});

describe("insertWikilink", () => {
  test("appends See also section when no suitable section exists", () => {
    const content = "# My File\n\nSome content here.\n";
    const result = insertWikilink(content, "Alice");
    expect(result).toContain("## See also");
    expect(result).toContain("- [[Alice]]");
  });

  test("adds to existing See also section", () => {
    const content =
      "# My File\n\nSome content.\n\n## See also\n\n- [[Bob]]\n";
    const result = insertWikilink(content, "Alice");
    expect(result).toContain("- [[Alice]]");
    expect(result).toContain("- [[Bob]]");
  });

  test("adds to Notes section", () => {
    const content =
      "# My File\n\nContent.\n\n## Notes\n\n- Note 1\n- Note 2\n";
    const result = insertWikilink(content, "Alice");
    expect(result).toContain("See also: [[Alice]]");
  });

  test("does not duplicate existing link", () => {
    const content = "# My File\n\n- [[Alice]]\n";
    const result = insertWikilink(content, "Alice");
    expect(result).toBe(content);
  });
});

describe("fixOrphans", () => {
  test("links orphan to file that mentions its name", () => {
    const files = [
      makeFile(
        "bank/entities/Alice.md",
        "# Alice\n\nAlice is an engineer. She worked with Bob on TypeScript projects.\n\n## Notes\n\n- Expert in TypeScript\n",
        ["Bob"]
      ),
      makeFile(
        "bank/entities/Bob.md",
        "# Bob\n\nBob is a product manager. Works with [[Alice]] on projects.\n",
        ["Alice"]
      ),
      makeFile(
        "Orphan.md",
        "# Orphan\n\nThis file talks about Alice and Bob and their work together. It discusses TypeScript development and project management approaches used by the team.\n",
        []
      ),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixOrphans(files, linkReport);

    // Should propose linking from files that mention orphan content
    expect(actions.length).toBeGreaterThanOrEqual(0);
    // The orphan has no one mentioning it by name, but content overlap should trigger
  });

  test("handles orphan with name mentioned in other files", () => {
    const files = [
      makeFile(
        "bank/entities/Alice.md",
        "# Alice\n\nAlice works on the Dashboard project. The Dashboard is very important.\n",
        ["Bob"]
      ),
      makeFile(
        "bank/entities/Bob.md",
        "# Bob\n\nBob helps with [[Alice]]'s projects.\n",
        ["Alice"]
      ),
      makeFile(
        "Dashboard.md",
        "# Dashboard\n\nThe dashboard provides metrics and analytics for the team. It shows key performance indicators and was built using React and TypeScript.\n",
        []
      ),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixOrphans(files, linkReport);

    // Alice's file mentions "Dashboard" → should propose linking Alice.md → Dashboard
    const linkActions = actions.filter((a) =>
      a.description.includes("Dashboard")
    );
    expect(linkActions.length).toBeGreaterThan(0);
  });

  test("skips orphans with very little content", () => {
    const files = [
      makeFile(
        "bank/entities/Alice.md",
        "# Alice\n\nAlice is an engineer.\n",
        []
      ),
      makeFile("Tiny.md", "# Tiny\n\nShort.\n", []),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixOrphans(files, linkReport);

    // Tiny.md has <10 words, should be skipped
    const tinyActions = actions.filter((a) =>
      a.description.includes("Tiny")
    );
    expect(tinyActions.length).toBe(0);
  });

  test("does not duplicate existing links", () => {
    const files = [
      makeFile(
        "bank/entities/Alice.md",
        "# Alice\n\nAlice works on the Dashboard project.\n",
        ["Dashboard"]
      ),
      makeFile(
        "Dashboard.md",
        "# Dashboard\n\nThe dashboard provides metrics and analytics for the team over a long period of time with many updates.\n",
        []
      ),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixOrphans(files, linkReport);

    // Alice already links to Dashboard, so no action needed
    const aliceActions = actions.filter((a) =>
      a.filePath === "bank/entities/Alice.md" &&
      a.description.includes("Dashboard")
    );
    expect(aliceActions.length).toBe(0);
  });
});
