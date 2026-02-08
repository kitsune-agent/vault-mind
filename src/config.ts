import { join } from "path";
import type { VaultMindConfig } from "./types.js";

const DEFAULT_CONFIG: VaultMindConfig = {
  staleness: {
    warningDays: 7,
    criticalDays: 30,
    coreFileCriticalDays: 14,
  },
  quality: {
    minWords: 50,
    maxWords: 5000,
  },
  coreFiles: ["MEMORY.md", "SOUL.md", "USER.md", "AGENTS.md", "TOOLS.md"],
  ignorePaths: [".vault-mind", ".obsidian", ".git", "node_modules"],
};

export async function loadConfig(vaultPath: string): Promise<VaultMindConfig> {
  const configPath = join(vaultPath, ".vault-mind.json");
  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const userConfig = await file.json();
      return {
        ...DEFAULT_CONFIG,
        ...userConfig,
        staleness: { ...DEFAULT_CONFIG.staleness, ...userConfig.staleness },
        quality: { ...DEFAULT_CONFIG.quality, ...userConfig.quality },
      };
    }
  } catch {
    // Use defaults if config can't be read
  }
  return DEFAULT_CONFIG;
}

export { DEFAULT_CONFIG };
