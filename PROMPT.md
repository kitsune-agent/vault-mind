You are building vault-mind -- a CLI tool that analyzes Obsidian/markdown-based agent memory systems and produces health reports. Think of it as a doctor's checkup for an AI agent's brain.

## Context

AI agents (like OpenClaw/Moltbot agents) maintain persistent memory in markdown files organized in Obsidian vaults. These vaults contain:
- Daily logs (memory/YYYY-MM-DD.md)
- Entity files (bank/entities/Person.md)
- Project files (bank/projects/Project.md)
- Core memory files (MEMORY.md, SOUL.md, USER.md, AGENTS.md, TOOLS.md)
- Self-review logs (memory/self-review.md)
- Opinion/experience files (bank/opinions.md, bank/experience.md)

Files use [[wikilinks]] to connect related topics. The vault IS the agent's memory -- its health directly affects agent performance.

## What to Build

A Bun + TypeScript CLI with these commands:

### 1. vault-mind scan <path>
Scan a vault directory and produce a health report. Output includes:

Staleness Analysis:
- Files not updated in 7/14/30+ days
- Core files (MEMORY.md, SOUL.md etc.) that are stale
- Entity files that haven't been updated recently
- Daily logs: are they being written? Any gaps?

Link Health:
- Count all [[wikilinks]] across the vault
- Find broken links (link target doesn't exist as a file)
- Find orphan files (exist but nothing links to them)
- Calculate connectivity score (ratio of linked vs. total files)

Growth Metrics:
- Total vault size (files, words, bytes)
- Daily log word count trend (are they getting longer/shorter?)
- New files created per week
- Entity file update frequency

Quality Signals:
- Files that are too short (<50 words -- likely stubs)
- Files that are too long (>5000 words -- needs splitting?)
- Files with no wikilinks (isolated knowledge)
- Self-review: MISS/HIT/FIX ratio
- Duplicate content detection (simple hash-based)

### 2. vault-mind graph <path>
Generate a text-based knowledge graph visualization. Show:
- Hub files (most linked-to)
- Clusters of related files
- Bridge files (connect otherwise separate clusters)
- Output as DOT format (for Graphviz) OR ASCII art

### 3. vault-mind timeline <path>
Show an ASCII timeline of vault activity:
- When files were last modified
- Activity heatmap by day/week
- Busiest areas of the vault

### 4. vault-mind doctor <path>
The main diagnostic command. Runs all checks and produces a structured report with:
- Overall health score (A-F grade)
- Top 5 issues to fix (actionable recommendations)
- Comparison to last run (if previous scan exists in .vault-mind/)
- Summary suitable for Telegram/chat delivery

### 5. vault-mind watch <path>
Optional: Watch mode that monitors the vault and alerts on:
- Core file staleness crossing thresholds
- Broken links appearing
- Daily log gaps

## Technical Requirements

- Runtime: Bun (use Bun.file for reading, no bun:sqlite needed for this project)
- Language: TypeScript (strict mode)
- Dependencies: Minimal. chalk for colors, commander for CLI.
- Config: .vault-mind.json in the vault root for custom thresholds
- Cache: .vault-mind/ directory stores previous scans for comparison
- Output formats: Pretty terminal output (default), JSON (--json flag), Markdown (--md flag)

## File Structure

src/cli.ts - CLI entry point (commander)
src/scanner.ts - Core vault scanning logic
src/analyzers/staleness.ts - File freshness analysis
src/analyzers/links.ts - Wikilink parsing and validation
src/analyzers/growth.ts - Size and trend metrics
src/analyzers/quality.ts - Content quality signals
src/analyzers/graph.ts - Knowledge graph analysis
src/reporters/terminal.ts - Pretty CLI output with colors
src/reporters/json.ts - JSON output
src/reporters/markdown.ts - Markdown report
src/reporters/doctor.ts - Doctor command aggregate report
src/cache.ts - .vault-mind/ cache management
src/config.ts - Configuration loading
src/types.ts - Shared TypeScript types
tests/scanner.test.ts
tests/analyzers/staleness.test.ts
tests/analyzers/links.test.ts
tests/analyzers/growth.test.ts
tests/analyzers/quality.test.ts
tests/fixtures/healthy-vault/ (test vault with good structure)
tests/fixtures/unhealthy-vault/ (test vault with issues)

## Design Principles

1. Fast: Scanning a 50-file vault should take <1 second
2. Useful defaults: Works great with zero configuration
3. Obsidian-native: Understands wikilinks, frontmatter, folder structure
4. Agent-friendly: JSON output mode for programmatic use by agents
5. Privacy-first: Everything runs locally, no network calls

## Tests

Write comprehensive tests:
- Test each analyzer independently with fixture vaults
- Test the scanner with both healthy and unhealthy vaults
- Test edge cases: empty vault, vault with no links, single file vault

When finished:
1. Run all tests with bun test
2. Commit everything with a descriptive message
3. Create a new GitHub repo: gh repo create kitsune-agent/vault-mind --public --description "Memory health analyzer for Obsidian-based agent workspaces" --source . --push
4. Write a comprehensive README.md
