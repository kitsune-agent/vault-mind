import { join } from "path";
import { mkdir } from "fs/promises";
import type { CachedScan, DoctorReport } from "./types.js";

const CACHE_DIR = ".vault-mind";
const SCAN_FILE = "last-scan.json";

export async function getCacheDir(vaultPath: string): Promise<string> {
  const dir = join(vaultPath, CACHE_DIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveScan(
  vaultPath: string,
  score: number,
  issues: DoctorReport["issues"]
): Promise<void> {
  const dir = await getCacheDir(vaultPath);
  const scan: CachedScan = {
    scanDate: new Date().toISOString(),
    score,
    issues,
  };
  await Bun.write(join(dir, SCAN_FILE), JSON.stringify(scan, null, 2));
}

export async function loadLastScan(
  vaultPath: string
): Promise<CachedScan | null> {
  const dir = join(vaultPath, CACHE_DIR);
  const file = Bun.file(join(dir, SCAN_FILE));
  try {
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // No cached scan
  }
  return null;
}
