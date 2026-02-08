import type { VaultScanResult } from "../types.js";

export function renderMarkdown(result: VaultScanResult): string {
  const lines: string[] = [];

  lines.push("# Vault Mind Scan Report\n");
  lines.push(`- **Vault**: ${result.vaultPath}`);
  lines.push(`- **Scanned**: ${result.scanDate}`);
  lines.push(
    `- **Files**: ${result.growth.totalFiles} | **Words**: ${result.growth.totalWords} | **Size**: ${formatBytes(result.growth.totalBytes)}`
  );

  lines.push("\n## Staleness\n");
  if (result.staleness.staleCoreFiles.length > 0) {
    lines.push("### Stale Core Files\n");
    lines.push("| File | Days Since Update |");
    lines.push("|------|-------------------|");
    for (const f of result.staleness.staleCoreFiles) {
      lines.push(`| ${f.path} | ${f.daysSinceUpdate} |`);
    }
  } else {
    lines.push("All core files are fresh.\n");
  }

  if (result.staleness.lastDailyLog) {
    lines.push(`\n- Last daily log: ${result.staleness.lastDailyLog}`);
    lines.push(
      `- Log streak: ${result.staleness.dailyLogStreak} consecutive days`
    );
  }
  if (result.staleness.dailyLogGaps.length > 0) {
    lines.push(
      `- ${result.staleness.dailyLogGaps.length} gap(s) in daily logs`
    );
  }

  lines.push("\n## Link Health\n");
  lines.push(
    `- Total links: ${result.links.totalLinks} (${result.links.uniqueLinks} unique)`
  );
  lines.push(
    `- Connectivity: ${(result.links.connectivityScore * 100).toFixed(0)}% overall | ${(result.links.knowledgeConnectivity * 100).toFixed(0)}% knowledge`
  );
  if (result.links.brokenLinks.length > 0) {
    lines.push(`\n### Broken Links\n`);
    lines.push("| Source | Target |");
    lines.push("|--------|--------|");
    for (const bl of result.links.brokenLinks) {
      lines.push(`| ${bl.source} | ${bl.target} |`);
    }
  }
  if (result.links.knowledgeOrphans.length > 0) {
    lines.push(
      `\n### Knowledge Orphans (${result.links.knowledgeOrphans.length})\n`
    );
    for (const o of result.links.knowledgeOrphans) {
      lines.push(`- ${o}`);
    }
  }
  if (result.links.structuralOrphans.length > 0) {
    lines.push(
      `\n### Structural Orphans (${result.links.structuralOrphans.length}) — expected\n`
    );
    for (const o of result.links.structuralOrphans) {
      lines.push(`- ${o}`);
    }
  }
  if (result.links.pathStyleLinks.length > 0) {
    lines.push(
      `\n### Path-Style Links (${result.links.pathStyleLinks.length}) — suggest short names\n`
    );
    lines.push("| Source | Target | Suggested |");
    lines.push("|--------|--------|-----------|");
    for (const pl of result.links.pathStyleLinks) {
      lines.push(`| ${pl.source} | ${pl.target} | ${pl.suggestedName} |`);
    }
  }

  lines.push("\n## Quality\n");
  if (result.quality.stubs.length > 0) {
    lines.push(
      `- **${result.quality.stubs.length}** stub(s) (<50 words): ${result.quality.stubs.slice(0, 5).join(", ")}`
    );
  }
  if (result.quality.oversized.length > 0) {
    lines.push(
      `- **${result.quality.oversized.length}** oversized file(s) (>5000 words): ${result.quality.oversized.slice(0, 5).join(", ")}`
    );
  }
  if (result.quality.isolatedFiles.length > 0) {
    lines.push(
      `- **${result.quality.isolatedFiles.length}** isolated file(s) (no wikilinks)`
    );
  }
  if (result.quality.selfReview) {
    const sr = result.quality.selfReview;
    lines.push(`- Self-review: ${sr.hits} HIT / ${sr.misses} MISS / ${sr.fixes} FIX`);
  }
  if (result.quality.duplicates.length > 0) {
    lines.push(`- **${result.quality.duplicates.length}** duplicate(s) detected`);
  }

  lines.push("\n## Knowledge Graph\n");
  if (result.graph.hubs.length > 0) {
    lines.push("### Hub Files\n");
    lines.push("| File | Incoming Links |");
    lines.push("|------|----------------|");
    for (const hub of result.graph.hubs.slice(0, 10)) {
      lines.push(`| ${hub.id} | ${hub.incomingLinks} |`);
    }
  }
  lines.push(`\n- ${result.graph.clusters.length} cluster(s) detected`);
  if (result.graph.bridges.length > 0) {
    lines.push(`- Bridge files: ${result.graph.bridges.join(", ")}`);
  }

  lines.push("");
  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
