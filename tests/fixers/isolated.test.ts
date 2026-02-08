import { describe, test, expect } from "bun:test";
import { fixIsolated, findMentions, nameVariants } from "../../src/fixers/isolated.js";
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

describe("nameVariants", () => {
  test("generates lowercase variant", () => {
    const variants = nameVariants("Alice");
    expect(variants).toContain("alice");
  });

  test("generates dash-to-space variant", () => {
    const variants = nameVariants("Faith-Phillips");
    expect(variants).toContain("faith-phillips");
    expect(variants).toContain("faith phillips");
  });

  test("generates camelCase split variant", () => {
    const variants = nameVariants("ProjectAlpha");
    expect(variants).toContain("project alpha");
  });
});

describe("findMentions", () => {
  test("finds name in plain text", () => {
    const result = findMentions(
      "I talked to Alice about the project.",
      "Alice"
    );
    expect(result.found).toBe(true);
    expect(result.positions.length).toBeGreaterThan(0);
  });

  test("does not match inside existing wikilinks", () => {
    const result = findMentions(
      "I talked to [[Alice]] about the project.",
      "Alice"
    );
    expect(result.found).toBe(false);
  });

  test("does not match inside code blocks", () => {
    const result = findMentions(
      "```\nAlice is in code\n```\n\nNormal text.",
      "Alice"
    );
    expect(result.found).toBe(false);
  });

  test("does not match inside inline code", () => {
    const result = findMentions(
      "The variable `Alice` is used here.",
      "Alice"
    );
    expect(result.found).toBe(false);
  });

  test("skips frontmatter", () => {
    const result = findMentions(
      "---\nauthor: Alice\n---\n\nSome other text.",
      "Alice"
    );
    expect(result.found).toBe(false);
  });

  test("matches with word boundaries", () => {
    const result = findMentions(
      "talking to Alice, she said",
      "Alice"
    );
    expect(result.found).toBe(true);
  });

  test("does not match partial words", () => {
    const result = findMentions(
      "The palace was beautiful.",
      "Alice"
    );
    expect(result.found).toBe(false);
  });
});

describe("fixIsolated", () => {
  test("adds wikilinks for mentioned entities", () => {
    const files = [
      makeFile(
        "notes.md",
        "# Meeting Notes\n\nDiscussed the project with Alice and Bob. They agreed on the approach.\n",
        [] // isolated — no wikilinks
      ),
      makeFile(
        "bank/entities/Alice.md",
        "# Alice\n\nAlice is a software engineer.\n",
        ["Bob"]
      ),
      makeFile(
        "bank/entities/Bob.md",
        "# Bob\n\nBob is a product manager.\n",
        ["Alice"]
      ),
    ];

    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);
    const actions = fixIsolated(files, qualityReport);

    // notes.md should get wikilinks for Alice and Bob
    expect(actions.length).toBe(1);
    expect(actions[0].filePath).toBe("notes.md");
    expect(actions[0].newContent).toContain("[[Alice]]");
    expect(actions[0].newContent).toContain("[[Bob]]");
  });

  test("only converts first mention to wikilink", () => {
    const files = [
      makeFile(
        "notes.md",
        "# Notes\n\nAlice said hello. Then Alice left. Alice came back.\n",
        []
      ),
      makeFile(
        "bank/entities/Alice.md",
        "# Alice\n\nAlice is an engineer.\n",
        []
      ),
    ];

    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);
    const actions = fixIsolated(files, qualityReport);

    expect(actions.length).toBe(1);
    const newContent = actions[0].newContent!;
    // Count wikilinks — should be exactly 1
    const matches = newContent.match(/\[\[Alice\]\]/g);
    expect(matches?.length).toBe(1);
    // Remaining mentions should be plain text
    expect(newContent).toContain("Then Alice left");
  });

  test("does not self-link", () => {
    const files = [
      makeFile(
        "Alice.md",
        "# Alice\n\nAlice is a person. She works on many things.\n",
        []
      ),
    ];

    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);
    const actions = fixIsolated(files, qualityReport);

    // Should not try to link Alice.md to itself
    expect(actions.length).toBe(0);
  });

  test("skips files that are not isolated", () => {
    const files = [
      makeFile(
        "notes.md",
        "# Notes\n\nAlice was here.\n",
        ["SomeLink"] // has links — not isolated
      ),
      makeFile(
        "bank/entities/Alice.md",
        "# Alice\n\nEngineer.\n",
        []
      ),
    ];

    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);
    const actions = fixIsolated(files, qualityReport);

    // notes.md is not isolated, so no fix
    const notesActions = actions.filter((a) => a.filePath === "notes.md");
    expect(notesActions.length).toBe(0);
  });

  test("handles camelCase entity names", () => {
    const files = [
      makeFile(
        "notes.md",
        "# Notes\n\nWorking on Project Alpha with the team today and tomorrow.\n",
        []
      ),
      makeFile(
        "bank/projects/ProjectAlpha.md",
        "# Project Alpha\n\nA software project.\n",
        []
      ),
    ];

    const qualityReport = analyzeQuality(files, DEFAULT_CONFIG);
    const actions = fixIsolated(files, qualityReport);

    // Should find "Project Alpha" matching "ProjectAlpha"
    const notesActions = actions.filter((a) => a.filePath === "notes.md");
    expect(notesActions.length).toBe(1);
    expect(notesActions[0].newContent).toContain("[[ProjectAlpha");
  });
});
