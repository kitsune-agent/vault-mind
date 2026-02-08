import { describe, test, expect } from "bun:test";
import { join } from "path";
import { scanVault, parseWikilinks, parseFrontmatter, countWords } from "../src/scanner.js";
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
