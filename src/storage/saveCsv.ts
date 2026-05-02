import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function saveCsv<T extends object>(path: string, rows: T[]): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const headers = [...rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>())];
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape((row as Record<string, unknown>)[header])).join(","))
  ].join("\n");
  await writeFile(path, `${csv}\n`, "utf8");
  return path;
}

function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
