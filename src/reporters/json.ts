import type { VaultScanResult, DoctorReport } from "../types.js";

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  return value;
}

export function renderJson(result: VaultScanResult): string {
  return JSON.stringify(result, replacer, 2);
}

export function renderDoctorJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}
