import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";

export async function saveCsv<T extends object>(path: string, rows: T[], explicitHeaders?: string[]): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const headers = explicitHeaders ?? [...rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>())];
  const stream = createWriteStream(path, { encoding: "utf8" });

  stream.write(`${headers.join(",")}\n`);
  for (const row of rows) {
    const line = headers.map((header) => csvEscape((row as Record<string, unknown>)[header])).join(",");
    if (!stream.write(`${line}\n`)) {
      await once(stream, "drain");
    }
  }

  stream.end();
  await once(stream, "finish");
  return path;
}

function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
