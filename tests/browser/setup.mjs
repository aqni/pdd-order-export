import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { hash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { unzipSync } from "fflate";
import pin from "./tampermonkey.json" with { type: "json" };

export default async function setup() {
  const require = createRequire(import.meta.url);
  const cli = resolve(
    dirname(require.resolve("playwright/package.json")),
    "cli.js",
  );
  if (
    !process.env.PLAYWRIGHT_CHANNEL ||
    process.env.PLAYWRIGHT_CHANNEL === "chromium"
  )
    execFileSync(
      process.execPath,
      [
        cli,
        "install",
        "--no-shell",
        ...(process.env.CI ? ["--with-deps"] : []),
        "chromium",
      ],
      { stdio: "inherit" },
    );
  const cache = resolve("node_modules/.cache/tampermonkey");
  await mkdir(cache, { recursive: true });
  const archivePath = resolve(cache, `${pin.version}.crx`);
  let archive;
  try {
    archive = await readFile(archivePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(pin.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new Error(`Tampermonkey download failed: ${response.status}`);
    archive = Buffer.from(await response.arrayBuffer());
  }
  if (hash("sha256", archive, "hex") !== pin.sha256) {
    throw new Error(
      "Tampermonkey package changed. Review the official release and update tests/browser/tampermonkey.json.",
    );
  }
  if (
    archive.toString("ascii", 0, 4) !== "Cr24" ||
    archive.readUInt32LE(4) !== 3
  ) {
    throw new Error("Expected an official CRX3 extension package.");
  }
  const files = unzipSync(archive.subarray(12 + archive.readUInt32LE(8)));
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  if (manifest.version !== pin.version || manifest.manifest_version !== 3) {
    throw new Error("Unexpected Tampermonkey version or manifest.");
  }
  const extension = resolve(cache, pin.version);
  await mkdir(extension, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    const target = resolve(extension, name);
    if (!target.startsWith(extension + sep))
      throw new Error("Invalid extension archive path.");
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await writeFile(archivePath, archive);
  console.log(`Prepared official Tampermonkey ${pin.version}.`);
}
