import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function saveJson(path: string, data: unknown): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return path;
}
