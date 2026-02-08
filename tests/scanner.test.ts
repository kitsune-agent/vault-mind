import { describe, test, expect } from "bun:test";
import { join } from "path";
import { scanVault, parseWikilinks, stripCodeBlocks, parseFrontmatter, countWords } from "../src/scanner.js";
import { DEFAULT_CONFIG } from "../src/config.js";

const HEALTHY_VAULT = join(import.meta.dir, "fixtures/healthy-vault");
const UNHEALTHY_VAULT = join(import.meta.dir, "fixtures/unhealthy-vault");

describe("parseWikilinks", () => {
  test("extracts simple wikilinks", () => {
    const content = "See [[Alice]] and [[Bob]] for details.";
    expect(parseWikilinks(content)).toEqual(["Alice", "Bob"]);
  });

  test("extracts wikilinks with aliases", () => {
    const content = "See [[Alice|my friend]] for details.";
    expect(parseWikilinks(content)).toEqual(["Alice"]);
  });

  test("returns empty for no links", () => {
    expect(parseWikilinks("No links here.")).toEqual([]);
  });

  test("handles multiple links on same line", () => {
    const content = "[[A]] then [[B]] then [[C]]";
    expect(parseWikilinks(content)).toEqual(["A", "B", "C"]);
  });

  test("ignores wikilinks inside fenced code blocks", () => {
    const content = `Real link to [[Alice]].

\`\`\`markdown
Example: [[TemplateName]]
\`\`\`

Also links to [[Bob]].`;
    expect(parseWikilinks(content)).toEqual(["Alice", "Bob"]);
  });

  test("ignores wikilinks inside inline code", () => {
    const content = "Use \`[[Name-Name]]\` syntax to link. See [[Alice]].";
    expect(parseWikilinks(content)).toEqual(["Alice"]);
  });

  test("ignores wikilinks in fenced code with language tag", () => {
    const content = `See [[Alice]].

\`\`\`typescript
const link = "[[CodeLink]]";
\`\`\`

And [[Bob]].`;
    expect(parseWikilinks(content)).toEqual(["Alice", "Bob"]);
  });

  test("handles mixed code blocks and inline code", () => {
    const content = `# Example

Link to [[Real]]. Use \`[[Template]]\` for templates.

\`\`\`
[[InsideBlock]]
\`\`\`

And [[AlsoReal]].`;
    expect(parseWikilinks(content)).toEqual(["Real", "AlsoReal"]);
  });
});

describe("stripCodeBlocks", () => {
  test("strips fenced code blocks", () => {
    const content = `Before

\`\`\`
code here
\`\`\`

After`;
    const stripped = stripCodeBlocks(content);
    expect(stripped).toContain("Before");
    expect(stripped).toContain("After");
    expect(stripped).not.toContain("code here");
  });

  test("strips inline code spans", () => {
    const content = "Use `code here` for examples.";
    const stripped = stripCodeBlocks(content);
    expect(stripped).toContain("Use");
    expect(stripped).toContain("for examples.");
    expect(stripped).not.toContain("code here");
  });

  test("handles multiple fenced blocks", () => {
    const content = `Text

\`\`\`
block1
\`\`\`

Middle

\`\`\`js
block2
\`\`\`

End`;
    const stripped = stripCodeBlocks(content);
    expect(stripped).toContain("Text");
    expect(stripped).toContain("Middle");
    expect(stripped).toContain("End");
    expect(stripped).not.toContain("block1");
    expect(stripped).not.toContain("block2");
  });

  test("preserves content outside code blocks", () => {
    const content = "No code blocks here.";
    expect(stripCodeBlocks(content)).toBe("No code blocks here.");
  });
});

describe("parseFrontmatter", () => {
  test("parses simple frontmatter", () => {
    const content = "---\ntype: person\nupdated: 2026-02-06\n---\n# Content";
    const result = parseFrontmatter(content);
    expect(result).toEqual({ type: "person", updated: "2026-02-06" });
  });

  test("returns null for no frontmatter", () => {
    expect(parseFrontmatter("# Just content")).toBeNull();
  });

  test("returns null for unclosed frontmatter", () => {
    expect(parseFrontmatter("---\ntype: person\n# Content")).toBeNull();
  });
});

describe("countWords", () => {
  test("counts words correctly", () => {
    expect(countWords("one two three four five")).toBe(5);
  });

  test("strips frontmatter before counting", () => {
    const content = "---\ntype: test\n---\none two three";
    expect(countWords(content)).toBe(3);
  });

  test("handles empty content", () => {
    expect(countWords("")).toBe(0);
  });
});

describe("scanVault", () => {
  test("scans healthy vault and finds all markdown files", async () => {
    const files = await scanVault(HEALTHY_VAULT, DEFAULT_CONFIG);
    expect(files.length).toBeGreaterThanOrEqual(10);

    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain("MEMORY.md");
    expect(paths).toContain("SOUL.md");
    expect(paths).toContain("USER.md");
    expect(paths).toContain("bank/entities/Alice.md");
  });

  test("scans unhealthy vault", async () => {
    const files = await scanVault(UNHEALTHY_VAULT, DEFAULT_CONFIG);
    expect(files.length).toBeGreaterThan(0);

    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain("stub.md");
    expect(paths).toContain("broken-links.md");
  });

  test("ignores .vault-mind and .obsidian directories", async () => {
    const files = await scanVault(HEALTHY_VAULT, DEFAULT_CONFIG);
    const paths = files.map((f) => f.relativePath);
    expect(paths.every((p) => !p.startsWith(".vault-mind"))).toBe(true);
    expect(paths.every((p) => !p.startsWith(".obsidian"))).toBe(true);
  });

  test("populates wordCount and wikilinks", async () => {
    const files = await scanVault(HEALTHY_VAULT, DEFAULT_CONFIG);
    const memory = files.find((f) => f.relativePath === "MEMORY.md");
    expect(memory).toBeDefined();
    expect(memory!.wordCount).toBeGreaterThan(0);
    expect(memory!.wikilinks.length).toBeGreaterThan(0);
  });
});
