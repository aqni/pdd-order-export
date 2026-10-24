import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { findPackageJSON } from "node:module";

export function installedVersion(name: string): string {
  const file = findPackageJSON(name, import.meta.url);
  if (!file) throw new Error(`Package metadata not found: ${name}`);
  return JSON.parse(readFileSync(file, "utf8")).version;
}

const pending = new Map<string, Promise<Library>>();

export interface Library {
  version: string;
  url: string;
  globalName: string;
  source: string;
}

/** 按 npm 的确切版本匹配 Greasy Fork 历史版本，缓存不可变产物。 */
export async function resolveLibrary(
  id: number,
  name: string,
  version: string,
  cacheDir = "node_modules/.cache/userscript-libraries",
): Promise<Library> {
  const file = resolve(
    cacheDir,
    `${id}-${encodeURIComponent(name)}-${version}.json`,
  );
  let request = pending.get(file);
  if (!request) {
    request = loadLibrary(id, name, version, file).finally(() => {
      pending.delete(file);
    });
    pending.set(file, request);
  }
  return request;
}

async function loadLibrary(
  id: number,
  name: string,
  version: string,
  file: string,
): Promise<Library> {
  try {
    const cached = JSON.parse(await readFile(file, "utf8")) as Library | null;
    if (
      cached?.version === version &&
      [cached.source, cached.url, cached.globalName].every(
        (value) => typeof value === "string" && value.length > 0,
      )
    )
      return cached;
  } catch (error) {
    if (
      !(error instanceof SyntaxError) &&
      !(error instanceof Error && "code" in error && error.code === "ENOENT")
    )
      throw error;
  }
  const versions = await get(
    `https://api.greasyfork.org/scripts/${id}/versions.json`,
  );
  const records: unknown = await versions.json();
  if (!Array.isArray(records))
    throw new Error(`Invalid Greasy Fork versions for ${name}`);
  const record = records.find((item) => item?.version === version);
  if (!record || typeof record.code_url !== "string")
    throw new Error(`Greasy Fork library ${id} has no ${name}@${version}`);
  const code = new URL(record.code_url);
  const revision = code.searchParams.get("version");
  const filename = code.pathname.match(
    new RegExp(`^/scripts/${id}(?:-[^/]+)?/code/([^/]+)$`),
  )?.[1];
  if (
    code.origin !== "https://greasyfork.org" ||
    !revision?.match(/^\d+$/) ||
    !filename
  )
    throw new Error(`Invalid Greasy Fork code URL: ${record.code_url}`);
  const url = `https://update.greasyfork.org/scripts/${id}/${revision}/${filename}`;
  const source = await (await get(url)).text();
  const globalName = source.match(
    /Access exports via (UserscriptLibraries\["[^"]+"\])\./,
  )?.[1];
  if (
    !globalName ||
    !source.match(
      new RegExp(`^// @version\\s+${RegExp.escape(version)}\\s*$`, "m"),
    )
  )
    throw new Error(`Invalid ${name}@${version} library metadata`);
  const library = { version, url, globalName, source };
  await mkdir(dirname(file), { recursive: true });
  // 原子替换，避免并行构建或浏览器测试读到写了一半的缓存。
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(library));
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return library;
}

async function get(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok)
    throw new Error(`Greasy Fork HTTP ${response.status}: ${url}`);
  return response;
}
