import { describe, test, expect } from "bun:test";
import { levenshtein, findBestMatch, fixBrokenLinks } from "../../src/fixers/links.js";
import { analyzeLinks } from "../../src/analyzers/links.js";
import type { VaultFile } from "../../src/types.js";

function makeFile(
  relativePath: string,
  content: string = "",
  wikilinks: string[] = []
): VaultFile {
  return {
    path: relativePath,
    relativePath,
    content,
    stats: { size: content.length || 100, mtime: new Date(), ctime: new Date() },
    wordCount: content.split(/\s+/).filter(Boolean).length || 50,
    wikilinks,
    frontmatter: null,
  };
}

describe("levenshtein", () => {
  test("identical strings have distance 0", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  test("empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "xyz")).toBe(3);
  });

  test("single character difference", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cat", "at")).toBe(1);
  });

  test("multiple differences", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("sunday", "saturday")).toBe(3);
  });
});

describe("findBestMatch", () => {
  test("finds exact match (case-insensitive)", () => {
    const result = findBestMatch("alice", ["Alice", "Bob", "Charlie"]);
    expect(result).toBe("Alice");
  });

  test("finds match with dash-vs-space difference", () => {
    const result = findBestMatch("Faith Phillips", [
      "Faith-Phillips",
      "Bob",
      "Charlie",
    ]);
    expect(result).toBe("Faith-Phillips");
  });

  test("finds close fuzzy match", () => {
    const result = findBestMatch("Allice", ["Alice", "Bob", "Charlie"]);
    expect(result).toBe("Alice");
  });

  test("returns null for no close match", () => {
    const result = findBestMatch("ZZZUnknown", ["Alice", "Bob", "Charlie"]);
    expect(result).toBeNull();
  });

  test("handles empty file list", () => {
    const result = findBestMatch("test", []);
    expect(result).toBeNull();
  });
});

describe("fixBrokenLinks", () => {
  test("rewrites broken links with fuzzy matches", () => {
    const files = [
      makeFile(
        "A.md",
        "Links to [[Allice]] and [[Bob]].",
        ["Allice", "Bob"]
      ),
      makeFile("Alice.md", "# Alice", []),
      makeFile("Bob.md", "# Bob", []),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixBrokenLinks(files, linkReport);

    // Should have one rewrite action for A.md (Allice → Alice)
    const rewriteActions = actions.filter((a) => !a.isCreate);
    expect(rewriteActions.length).toBe(1);
    expect(rewriteActions[0].filePath).toBe("A.md");
    expect(rewriteActions[0].newContent).toContain("[[Alice]]");
    expect(rewriteActions[0].newContent).not.toContain("[[Allice]]");
  });

  test("creates stubs for unmatched targets", () => {
    const files = [
      makeFile(
        "A.md",
        "Links to [[CompletelyNewThing]].",
        ["CompletelyNewThing"]
      ),
      makeFile("Bob.md", "# Bob", []),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixBrokenLinks(files, linkReport);

    const createActions = actions.filter((a) => a.isCreate);
    expect(createActions.length).toBe(1);
    expect(createActions[0].filePath).toBe("CompletelyNewThing.md");
    expect(createActions[0].createContent).toContain("# CompletelyNewThing");
  });

  test("preserves aliases in rewritten links", () => {
    const files = [
      makeFile(
        "A.md",
        "Links to [[Allice|my friend]] and [[Bob]].",
        ["Allice", "Bob"]
      ),
      makeFile("Alice.md", "# Alice", []),
      makeFile("Bob.md", "# Bob", []),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixBrokenLinks(files, linkReport);

    const rewriteActions = actions.filter((a) => !a.isCreate);
    expect(rewriteActions.length).toBe(1);
    expect(rewriteActions[0].newContent).toContain("[[Alice|my friend]]");
  });

  test("handles no broken links gracefully", () => {
    const files = [
      makeFile("A.md", "Links to [[Bob]].", ["Bob"]),
      makeFile("Bob.md", "# Bob", []),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixBrokenLinks(files, linkReport);
    expect(actions.length).toBe(0);
  });

  test("handles case differences via fuzzy match", () => {
    const files = [
      makeFile(
        "A.md",
        "Links to [[project-alpha]].",
        ["project-alpha"]
      ),
      makeFile("ProjectAlpha.md", "# Project Alpha", []),
    ];

    const linkReport = analyzeLinks(files);
    const actions = fixBrokenLinks(files, linkReport);

    // Should find ProjectAlpha as a match for project-alpha
    const rewriteActions = actions.filter((a) => !a.isCreate);
    expect(rewriteActions.length).toBe(1);
    expect(rewriteActions[0].newContent).toContain("[[ProjectAlpha]]");
  });
});
