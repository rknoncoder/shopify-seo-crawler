import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";

export async function saveJson(path: string, data: unknown): Promise<string> {
  await mkdir(dirname(path), { recursive: true });

  if (Array.isArray(data)) {
    await saveJsonArray(path, data);
    return path;
  }

  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return path;
}

async function saveJsonArray(path: string, rows: unknown[]): Promise<void> {
  const stream = createWriteStream(path, { encoding: "utf8" });
  stream.write("[\n");

  for (let index = 0; index < rows.length; index += 1) {
    const prefix = index === 0 ? "  " : ",\n  ";
    if (!stream.write(`${prefix}${JSON.stringify(rows[index])}`)) {
      await once(stream, "drain");
    }
  }

  stream.end("\n]\n");
  await once(stream, "finish");
}
