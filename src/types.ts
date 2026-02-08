export interface VaultFile {
  path: string;
  relativePath: string;
  content: string;
  stats: {
    size: number;
    mtime: Date;
    ctime: Date;
  };
  wordCount: number;
  wikilinks: string[];
  frontmatter: Record<string, unknown> | null;
}

export interface StalenessReport {
  staleFiles: { path: string; daysSinceUpdate: number; category: string }[];
  staleCoreFiles: { path: string; daysSinceUpdate: number }[];
  dailyLogGaps: string[]; // dates missing
  dailyLogStreak: number; // consecutive days with logs
  lastDailyLog: string | null;
}

export interface LinkReport {
  totalLinks: number;
  uniqueLinks: number;
  brokenLinks: { source: string; target: string }[];
  orphanFiles: string[];
  connectivityScore: number; // 0-1 ratio
  linksByFile: Map<string, string[]>;
}

export interface GrowthReport {
  totalFiles: number;
  totalWords: number;
  totalBytes: number;
  dailyLogTrend: { date: string; wordCount: number }[];
  filesCreatedPerWeek: { week: string; count: number }[];
  entityUpdateFrequency: { path: string; daysSinceUpdate: number }[];
}

export interface QualityReport {
  stubs: string[]; // < 50 words
  oversized: string[]; // > 5000 words
  isolatedFiles: string[]; // no wikilinks
  selfReview: { hits: number; misses: number; fixes: number } | null;
  duplicates: { file1: string; file2: string; similarity: string }[];
}

export interface GraphData {
  nodes: { id: string; linkCount: number; category: string }[];
  edges: { source: string; target: string }[];
  hubs: { id: string; incomingLinks: number }[];
  bridges: string[];
  clusters: string[][];
}

export interface TimelineEntry {
  date: string;
  files: { path: string; action: string }[];
  wordCount: number;
}

export interface VaultScanResult {
  vaultPath: string;
  scanDate: string;
  files: VaultFile[];
  staleness: StalenessReport;
  links: LinkReport;
  growth: GrowthReport;
  quality: QualityReport;
  graph: GraphData;
}

export interface DoctorReport {
  grade: string; // A-F
  score: number; // 0-100
  issues: { severity: "critical" | "warning" | "info"; message: string; fix: string }[];
  summary: string;
  comparison: {
    previousScore: number | null;
    scoreDelta: number | null;
    newIssues: number;
    resolvedIssues: number;
  } | null;
}

export interface VaultMindConfig {
  staleness: {
    warningDays: number;
    criticalDays: number;
    coreFileCriticalDays: number;
  };
  quality: {
    minWords: number;
    maxWords: number;
  };
  coreFiles: string[];
  ignorePaths: string[];
}

export interface CachedScan {
  scanDate: string;
  score: number;
  issues: DoctorReport["issues"];
}

export type OutputFormat = "terminal" | "json" | "markdown";
