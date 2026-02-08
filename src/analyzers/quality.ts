import { createHash } from "crypto";
import type { VaultFile, VaultMindConfig, QualityReport } from "../types.js";

const SELF_REVIEW_REGEX = /^memory\/self-review\.md$/;

function contentHash(content: string): string {
  // Normalize: strip frontmatter, lowercase, collapse whitespace
  let text = content;
  if (text.startsWith("---")) {
    const end = text.indexOf("---", 3);
    if (end !== -1) text = text.slice(end + 3);
  }
  text = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("md5").update(text).digest("hex");
}

function parseSelfReview(
  content: string
): { hits: number; misses: number; fixes: number } | null {
  const hitMatch = content.match(/\bHIT\b/gi);
  const missMatch = content.match(/\bMISS\b/gi);
  const fixMatch = content.match(/\bFIX\b/gi);

  if (!hitMatch && !missMatch && !fixMatch) return null;

  return {
    hits: hitMatch?.length || 0,
    misses: missMatch?.length || 0,
    fixes: fixMatch?.length || 0,
  };
}

export function analyzeQuality(
  files: VaultFile[],
  config: VaultMindConfig
): QualityReport {
  const stubs: string[] = [];
  const oversized: string[] = [];
  const isolatedFiles: string[] = [];
  let selfReview: QualityReport["selfReview"] = null;
  const duplicates: QualityReport["duplicates"] = [];

  // Content hashes for duplicate detection
  const hashes = new Map<string, string>(); // hash -> first file path

  for (const file of files) {
    // Stubs
    if (file.wordCount < config.quality.minWords) {
      stubs.push(file.relativePath);
    }

    // Oversized
    if (file.wordCount > config.quality.maxWords) {
      oversized.push(file.relativePath);
    }

    // Isolated (no wikilinks in the file)
    if (file.wikilinks.length === 0) {
      isolatedFiles.push(file.relativePath);
    }

    // Self-review parsing
    if (SELF_REVIEW_REGEX.test(file.relativePath)) {
      selfReview = parseSelfReview(file.content);
    }

    // Duplicate detection
    if (file.wordCount >= 10) {
      // Only check files with some content
      const hash = contentHash(file.content);
      const existing = hashes.get(hash);
      if (existing) {
        duplicates.push({
          file1: existing,
          file2: file.relativePath,
          similarity: "exact",
        });
      } else {
        hashes.set(hash, file.relativePath);
      }
    }
  }

  return { stubs, oversized, isolatedFiles, selfReview, duplicates };
}
