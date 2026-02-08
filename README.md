# vault-mind

Memory health analyzer for Obsidian-based agent workspaces. Think of it as a doctor's checkup for an AI agent's brain.

AI agents that maintain persistent memory in markdown vaults (daily logs, entity files, project files, core memory) need their knowledge bases to stay healthy. vault-mind scans these vaults and reports on staleness, broken links, content quality, and knowledge graph structure.

## Install

```sh
bun install
```

## Usage

### Scan

Scan a vault and produce a health report:

```sh
bun run src/cli.ts scan /path/to/vault
```

Output includes staleness analysis, link health, growth metrics, quality signals, and knowledge graph summary.

### Doctor

Run diagnostics with a letter grade and actionable recommendations:

```sh
bun run src/cli.ts doctor /path/to/vault
```

Produces an A-F grade, top issues to fix, and comparison to previous scan. Saves results to `.vault-mind/` for tracking over time.

### Graph

Generate a knowledge graph visualization:

```sh
bun run src/cli.ts graph /path/to/vault        # ASCII output
bun run src/cli.ts graph /path/to/vault --dot   # Graphviz DOT format
bun run src/cli.ts graph /path/to/vault --json  # JSON data
```

Shows hub files, clusters, and bridge files that connect otherwise separate areas.

### Timeline

Show an ASCII timeline of vault activity:

```sh
bun run src/cli.ts timeline /path/to/vault
```

Displays activity heatmap by day and week, plus busiest areas of the vault.

### Watch

Monitor the vault for changes and alert on issues:

```sh
bun run src/cli.ts watch /path/to/vault
```

## Output Formats

All scan and doctor commands support multiple output formats:

```sh
bun run src/cli.ts scan /path/to/vault          # Pretty terminal output
bun run src/cli.ts scan /path/to/vault --json    # JSON (for programmatic use)
bun run src/cli.ts scan /path/to/vault --md      # Markdown report
```

## What It Checks

**Staleness** — Files not updated in 7/14/30+ days. Core files (MEMORY.md, SOUL.md, USER.md, AGENTS.md, TOOLS.md) flagged when stale. Daily log gaps and streaks tracked.

**Link Health** — All `[[wikilinks]]` counted. Broken links (target doesn't exist) and orphan files (nothing links to them) identified. Connectivity score calculated.

**Growth** — Total vault size, daily log word count trends, files created per week, entity update frequency.

**Quality** — Stubs (<50 words), oversized files (>5000 words), isolated files (no wikilinks), self-review HIT/MISS/FIX ratio, duplicate content detection.

**Knowledge Graph** — Hub files (most linked-to), clusters of related files, bridge files (connect otherwise separate clusters).

## Expected Vault Structure

```
vault/
├── MEMORY.md              # Core memory
├── SOUL.md                # Personality/behavior
├── USER.md                # User information
├── AGENTS.md              # Multi-agent config
├── TOOLS.md               # Available tools
├── memory/
│   ├── 2026-02-08.md      # Daily logs
│   ├── 2026-02-07.md
│   └── self-review.md     # HIT/MISS/FIX tracking
└── bank/
    ├── entities/
    │   ├── Alice.md        # People/things
    │   └── Bob.md
    ├── projects/
    │   └── ProjectAlpha.md
    ├── opinions.md
    └── experience.md
```

## Configuration

Create `.vault-mind.json` in your vault root to customize thresholds:

```json
{
  "staleness": {
    "warningDays": 7,
    "criticalDays": 30,
    "coreFileCriticalDays": 14
  },
  "quality": {
    "minWords": 50,
    "maxWords": 5000
  },
  "coreFiles": ["MEMORY.md", "SOUL.md", "USER.md", "AGENTS.md", "TOOLS.md"],
  "ignorePaths": [".vault-mind", ".obsidian", ".git", "node_modules"]
}
```

## Tests

```sh
bun test
```

44 tests covering scanner, staleness, links, growth, and quality analyzers with healthy and unhealthy vault fixtures.

## License

MIT
