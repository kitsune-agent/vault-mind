#!/usr/bin/env bun
import { Command } from "commander";
import { resolve } from "path";
import { loadConfig } from "./config.js";
import { scanVault } from "./scanner.js";
import { analyzeStaleness } from "./analyzers/staleness.js";
import { analyzeLinks } from "./analyzers/links.js";
import { analyzeGrowth } from "./analyzers/growth.js";
import { analyzeQuality } from "./analyzers/quality.js";
import { analyzeGraph, toDotFormat } from "./analyzers/graph.js";
import { renderTerminal } from "./reporters/terminal.js";
import { renderJson, renderDoctorJson } from "./reporters/json.js";
import { renderMarkdown } from "./reporters/markdown.js";
import {
  generateDoctorReport,
  renderDoctorTerminal,
  renderDoctorMarkdown,
} from "./reporters/doctor.js";
import { renderTimeline } from "./reporters/timeline.js";
import { saveScan, loadLastScan } from "./cache.js";
import type { VaultScanResult } from "./types.js";

const program = new Command();

program
  .name("vault-mind")
  .description("Memory health analyzer for Obsidian-based agent workspaces")
  .version("0.1.0");

async function runScan(
  vaultPath: string
): Promise<VaultScanResult> {
  const absPath = resolve(vaultPath);
  const config = await loadConfig(absPath);
  const files = await scanVault(absPath, config);

  return {
    vaultPath: absPath,
    scanDate: new Date().toISOString(),
    files,
    staleness: analyzeStaleness(files, config),
    links: analyzeLinks(files),
    growth: analyzeGrowth(files),
    quality: analyzeQuality(files, config),
    graph: analyzeGraph(files),
  };
}

program
  .command("scan <path>")
  .description("Scan a vault and produce a health report")
  .option("--json", "Output as JSON")
  .option("--md", "Output as Markdown")
  .action(async (path: string, opts: { json?: boolean; md?: boolean }) => {
    const result = await runScan(path);
    if (opts.json) {
      console.log(renderJson(result));
    } else if (opts.md) {
      console.log(renderMarkdown(result));
    } else {
      console.log(renderTerminal(result));
    }
  });

program
  .command("graph <path>")
  .description("Generate a knowledge graph visualization")
  .option("--dot", "Output as DOT format (for Graphviz)")
  .option("--json", "Output as JSON")
  .action(async (path: string, opts: { dot?: boolean; json?: boolean }) => {
    const result = await runScan(path);
    if (opts.dot) {
      console.log(toDotFormat(result.graph));
    } else if (opts.json) {
      console.log(JSON.stringify(result.graph, null, 2));
    } else {
      // ASCII visualization
      console.log(renderGraphAscii(result.graph));
    }
  });

program
  .command("timeline <path>")
  .description("Show an ASCII timeline of vault activity")
  .action(async (path: string) => {
    const absPath = resolve(path);
    const config = await loadConfig(absPath);
    const files = await scanVault(absPath, config);
    console.log(renderTimeline(files));
  });

program
  .command("doctor <path>")
  .description("Run diagnostics and produce a health report with grade")
  .option("--json", "Output as JSON")
  .option("--md", "Output as Markdown")
  .action(async (path: string, opts: { json?: boolean; md?: boolean }) => {
    const absPath = resolve(path);
    const result = await runScan(path);
    const previousScan = await loadLastScan(absPath);
    const report = generateDoctorReport(result, previousScan);

    // Save current scan for future comparison
    await saveScan(absPath, report.score, report.issues);

    if (opts.json) {
      console.log(renderDoctorJson(report));
    } else if (opts.md) {
      console.log(renderDoctorMarkdown(report));
    } else {
      console.log(renderDoctorTerminal(report));
    }
  });

program
  .command("watch <path>")
  .description("Watch vault for changes and alert on issues")
  .action(async (path: string) => {
    const absPath = resolve(path);
    const { watch } = await import("fs");
    console.log(`Watching ${absPath} for changes...\n`);

    let debounce: ReturnType<typeof setTimeout> | null = null;

    watch(absPath, { recursive: true }, (_event, filename) => {
      if (!filename || filename.startsWith(".vault-mind")) return;
      if (!filename.endsWith(".md")) return;

      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(async () => {
        console.log(`\nChange detected: ${filename}`);
        const result = await runScan(path);
        const previousScan = await loadLastScan(absPath);
        const report = generateDoctorReport(result, previousScan);

        if (report.issues.some((i) => i.severity === "critical")) {
          console.log("\n⚠️  Critical issues detected:");
          for (const issue of report.issues.filter(
            (i) => i.severity === "critical"
          )) {
            console.log(`  ✗ ${issue.message}`);
          }
        }
        console.log(`Grade: ${report.grade} (${report.score}/100)`);
      }, 1000);
    });

    // Keep process alive
    await new Promise(() => {});
  });

function renderGraphAscii(graph: import("./types.js").GraphData): string {
  const lines: string[] = [];
  const chalk = require("chalk") as typeof import("chalk").default;

  lines.push(chalk.bold.magenta("\n🕸️  vault-mind knowledge graph\n"));

  if (graph.hubs.length > 0) {
    lines.push(chalk.bold.cyan("━━━ Hub Files (most linked-to) ━━━\n"));
    for (const hub of graph.hubs.slice(0, 10)) {
      const bar = "●".repeat(Math.min(hub.incomingLinks, 20));
      lines.push(
        `  ${chalk.white(hub.id)} ${chalk.cyan(bar)} ${chalk.dim("(" + hub.incomingLinks + ")")}`
      );
    }
  }

  lines.push(chalk.bold.cyan("\n━━━ Clusters ━━━\n"));
  for (let i = 0; i < graph.clusters.length; i++) {
    const cluster = graph.clusters[i];
    lines.push(
      `  ${chalk.yellow("Cluster " + (i + 1))} (${cluster.length} files):`
    );
    for (const file of cluster.slice(0, 5)) {
      lines.push(`    ${chalk.dim("•")} ${file}`);
    }
    if (cluster.length > 5) {
      lines.push(chalk.dim(`    ... and ${cluster.length - 5} more`));
    }
  }

  if (graph.bridges.length > 0) {
    lines.push(chalk.bold.cyan("\n━━━ Bridge Files ━━━\n"));
    lines.push(chalk.dim("  (Removing these would split the graph)\n"));
    for (const bridge of graph.bridges) {
      lines.push(`  ${chalk.yellow("⬡")} ${bridge}`);
    }
  }

  lines.push(
    `\n  ${chalk.dim("Tip: Use --dot flag for Graphviz DOT format output")}\n`
  );
  return lines.join("\n");
}

program.parse();
