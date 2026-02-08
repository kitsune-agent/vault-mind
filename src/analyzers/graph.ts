import { basename } from "path";
import type { VaultFile, GraphData } from "../types.js";

function categorizeFile(relativePath: string): string {
  if (/^memory\/\d{4}-\d{2}-\d{2}\.md$/.test(relativePath)) return "daily-log";
  if (relativePath.startsWith("bank/entities/")) return "entity";
  if (relativePath.startsWith("bank/projects/")) return "project";
  if (relativePath.startsWith("bank/")) return "bank";
  if (relativePath.startsWith("memory/")) return "memory";
  return "core";
}

export function analyzeGraph(files: VaultFile[]): GraphData {
  const fileNameToPath = new Map<string, string>();
  const incomingCounts = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  // Build lookup
  for (const file of files) {
    const name = basename(file.relativePath, ".md").toLowerCase();
    fileNameToPath.set(name, file.relativePath);
    adjacency.set(file.relativePath, new Set());
    incomingCounts.set(file.relativePath, 0);
  }

  // Build edges
  const edges: GraphData["edges"] = [];
  for (const file of files) {
    for (const link of file.wikilinks) {
      const targetPath = fileNameToPath.get(link.toLowerCase());
      if (targetPath && targetPath !== file.relativePath) {
        edges.push({ source: file.relativePath, target: targetPath });
        adjacency.get(file.relativePath)?.add(targetPath);
        incomingCounts.set(
          targetPath,
          (incomingCounts.get(targetPath) || 0) + 1
        );
      }
    }
  }

  // Build nodes
  const nodes: GraphData["nodes"] = files.map((f) => ({
    id: f.relativePath,
    linkCount: f.wikilinks.length,
    category: categorizeFile(f.relativePath),
  }));

  // Hubs: files with most incoming links
  const hubs = Array.from(incomingCounts.entries())
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, incomingLinks: count }));

  // Simple cluster detection using BFS on undirected graph
  const clusters = findClusters(files, adjacency);

  // Bridge detection: nodes whose removal increases cluster count
  const bridges = findBridges(files, adjacency, clusters);

  return { nodes, edges, hubs, bridges, clusters };
}

function findClusters(
  files: VaultFile[],
  adjacency: Map<string, Set<string>>
): string[][] {
  const visited = new Set<string>();
  const clusters: string[][] = [];

  // Build undirected adjacency
  const undirected = new Map<string, Set<string>>();
  for (const file of files) {
    undirected.set(file.relativePath, new Set());
  }
  for (const [source, targets] of adjacency) {
    for (const target of targets) {
      undirected.get(source)?.add(target);
      undirected.get(target)?.add(source);
    }
  }

  for (const file of files) {
    if (visited.has(file.relativePath)) continue;
    const cluster: string[] = [];
    const queue = [file.relativePath];
    visited.add(file.relativePath);

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);
      const neighbors = undirected.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    clusters.push(cluster);
  }

  return clusters;
}

function findBridges(
  files: VaultFile[],
  adjacency: Map<string, Set<string>>,
  originalClusters: string[][]
): string[] {
  if (originalClusters.length <= 1 && files.length <= 1) return [];

  const bridges: string[] = [];
  const originalClusterCount = originalClusters.length;

  // Only check nodes that have connections
  const connectedNodes = files.filter(
    (f) => (adjacency.get(f.relativePath)?.size || 0) > 0
  );

  for (const file of connectedNodes) {
    // Simulate removing this node
    const remainingFiles = files.filter(
      (f) => f.relativePath !== file.relativePath
    );
    const filteredAdj = new Map<string, Set<string>>();
    for (const [source, targets] of adjacency) {
      if (source === file.relativePath) continue;
      const filtered = new Set<string>();
      for (const t of targets) {
        if (t !== file.relativePath) filtered.add(t);
      }
      filteredAdj.set(source, filtered);
    }

    const newClusters = findClusters(remainingFiles, filteredAdj);
    if (newClusters.length > originalClusterCount) {
      bridges.push(file.relativePath);
    }
  }

  return bridges;
}

export function toDotFormat(graph: GraphData): string {
  const lines = ["digraph VaultMind {", '  rankdir=LR;', '  node [shape=box];'];

  // Style nodes by category
  const categoryColors: Record<string, string> = {
    core: "#ff6b6b",
    "daily-log": "#4ecdc4",
    entity: "#45b7d1",
    project: "#96ceb4",
    bank: "#ffeaa7",
    memory: "#dda0dd",
  };

  for (const node of graph.nodes) {
    const color = categoryColors[node.category] || "#cccccc";
    const label = node.id.replace(/\.md$/, "");
    lines.push(
      `  "${node.id}" [label="${label}", style=filled, fillcolor="${color}"];`
    );
  }

  for (const edge of graph.edges) {
    lines.push(`  "${edge.source}" -> "${edge.target}";`);
  }

  lines.push("}");
  return lines.join("\n");
}
