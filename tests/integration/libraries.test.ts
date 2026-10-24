import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installedVersion, resolveLibrary } from "../../build/libraries";

let cache: string;
beforeEach(async () => {
  cache = await mkdtemp(join(tmpdir(), "pdd-library-"));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(cache, { recursive: true, force: true });
});

const versions = [
  {
    version: "4.0.0",
    code_url: "https://greasyfork.org/scripts/42-lit/code/lit.js?version=102",
  },
  {
    version: "3.3.3",
    code_url: "https://greasyfork.org/scripts/42-lit/code/lit.js?version=101",
  },
];
const source =
  '// @version 3.3.3\n// @description Access exports via UserscriptLibraries["lit"].\nvar UserscriptLibraries = {lit: {}};';

test("matches the installed version instead of latest and caches the pinned artifact and export object", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(versions))
    .mockResolvedValueOnce(new Response(source));
  vi.stubGlobal("fetch", fetcher);
  const library = await resolveLibrary(42, "lit", "3.3.3", cache);
  expect(library).toEqual({
    version: "3.3.3",
    url: "https://update.greasyfork.org/scripts/42/101/lit.js",
    globalName: 'UserscriptLibraries["lit"]',
    source,
  });
  expect(fetcher.mock.calls[0]![0]).toBe(
    "https://api.greasyfork.org/scripts/42/versions.json",
  );
  expect(fetcher.mock.calls[1]![0]).toBe(library.url);
  fetcher.mockRejectedValue(new Error("offline"));
  await expect(resolveLibrary(42, "lit", "3.3.3", cache)).resolves.toEqual(
    library,
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("a missing package version fails instead of silently loading latest", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(versions)));
  await expect(resolveLibrary(42, "lit", "3.3.2", cache)).rejects.toThrow(
    "no lit@3.3.2",
  );
});

test("concurrent consumers share the version lookup and artifact download", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(versions))
    .mockResolvedValueOnce(new Response(source));
  vi.stubGlobal("fetch", fetcher);
  const libraries = await Promise.all([
    resolveLibrary(42, "lit", "3.3.3", cache),
    resolveLibrary(42, "lit", "3.3.3", join(cache, ".")),
  ]);
  expect(libraries[0]).toEqual(libraries[1]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test.each(["{", "null", '{"version":"3.3.3","source":{}}'])(
  "replaces a damaged or incomplete cache: %s",
  async (cached) => {
    await writeFile(join(cache, "42-lit-3.3.3.json"), cached);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(versions))
        .mockResolvedValueOnce(new Response(source)),
    );
    await expect(
      resolveLibrary(42, "lit", "3.3.3", cache),
    ).resolves.toMatchObject({
      source,
    });
    expect(
      JSON.parse(await readFile(join(cache, "42-lit-3.3.3.json"), "utf8")),
    ).toMatchObject({ source });
  },
);

test("a failed request does not prevent a later retry", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(Response.json(versions))
    .mockResolvedValueOnce(new Response(source));
  vi.stubGlobal("fetch", fetcher);
  await expect(resolveLibrary(42, "lit", "3.3.3", cache)).rejects.toThrow(
    "offline",
  );
  await expect(
    resolveLibrary(42, "lit", "3.3.3", cache),
  ).resolves.toMatchObject({
    source,
  });
});

test.each([
  "https://greasyfork.org/scripts/43-lit/code/lit.js?version=101",
  "http://greasyfork.org/scripts/42-lit/code/lit.js?version=101",
])("rejects a code URL outside the requested library: %s", async (code_url) => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json([{ version: "3.3.3", code_url }]));
  vi.stubGlobal("fetch", fetcher);
  await expect(resolveLibrary(42, "lit", "3.3.3", cache)).rejects.toThrow(
    "Invalid Greasy Fork code URL",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test.each(["lit", "acorn", "wretch"])(
  "finds the root package version even when the entry is in a subdirectory: %s",
  async (name) => {
    const manifest = JSON.parse(
      await readFile(`node_modules/${name}/package.json`, "utf8"),
    );
    expect(installedVersion(name)).toBe(manifest.version);
  },
);

test.each(["3.3.3+build.1", "3.3.3-build.1"])(
  "matches version metadata literally: %s",
  async (version) => {
    const code = source.replace("3.3.3", version);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([{ ...versions[1], version }]))
        .mockResolvedValueOnce(new Response(code)),
    );
    await expect(
      resolveLibrary(42, "lit", version, cache),
    ).resolves.toMatchObject({ version, source: code });
  },
);

test.each(["// @version 3.3.1", "// @version 3.3.3\n// No export object"])(
  "rejects mismatched library metadata: %s",
  async (code) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(versions))
        .mockResolvedValueOnce(new Response(code)),
    );
    await expect(resolveLibrary(42, "lit", "3.3.3", cache)).rejects.toThrow(
      "Invalid lit@3.3.3",
    );
  },
);

test("HTTP failure identifies the API endpoint", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
  );
  await expect(resolveLibrary(42, "lit", "3.3.3", cache)).rejects.toThrow(
    "Greasy Fork HTTP 503",
  );
});

test("release artifacts pin Lit and the standalone userscript has no external runtime dependencies", async () => {
  const external = await readFile("dist/pdd-order-export.user.js", "utf8");
  const standalone = await readFile(
    "dist/pdd-order-export.standalone.user.js",
    "utf8",
  );
  expect(external).toMatch(
    /@require\s+https:\/\/update\.greasyfork\.org\/scripts\/601930\/\d+\//,
  );
  expect(external).toContain('UserscriptLibraries["lit"]');
  expect(external).not.toContain("preact");
  expect(standalone).not.toMatch(/@require\s/);
  expect(standalone).not.toContain("UserscriptLibraries");
  expect(standalone).toContain("独立版");
  expect(installedVersion("lit")).toBe("3.3.3");
});
