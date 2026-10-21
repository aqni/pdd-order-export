import { test, expect } from "vitest";
import { createServer } from "vite";
import type { AddressInfo } from "node:net";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertReleaseTag, getUserscriptVersion } from "../../build/version";

test("the real development server serves an installable script and compiled validators", async () => {
  const server = await createServer({
    configFile: "vite.config.ts",
    mode: "test",
    logLevel: "silent",
    server: { port: 0, open: false },
  });
  try {
    await server.listen();
    const base =
      "http://127.0.0.1:" + (server.httpServer!.address() as AddressInfo).port;
    const installer = await (
      await fetch(base + "/__vite-plugin-monkey.install.user.js")
    ).text();
    expect(installer).toMatch(/@name\s+server:/);
    expect(installer).toContain("https://mobile.pinduoduo.com/orders.html*");
    const module = await (await fetch(base + "/src/pdd.ts")).text();
    expect(module).toContain("getOrderDetail");
    expect(module).not.toMatch(/\bassert<|\bassert\s*\(/);
    for (const component of ["view", "main"]) {
      const response = await fetch(base + `/src/${component}.ts`);
      expect(response.ok).toBe(true);
    }
  } finally {
    await server.close();
  }
}, 30000);

test("Git release, development and dirty versions remain distinguishable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pdd-test-git-"));
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "safe.directory=" + directory, "-C", directory, ...args],
      { encoding: "utf8" },
    ).trim();
  try {
    git("init", "--quiet");
    git("config", "user.name", "Synthetic Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", ".unused");
    await writeFile(join(directory, "source.txt"), "initial");
    git("add", ".");
    git("commit", "--quiet", "-m", "initial");
    git("tag", "v2026-10-18");
    expect(getUserscriptVersion(directory, {})).toBe("2026-10-18");
    git("tag", "v2026-10-18.1");
    const release = {
      GITHUB_EVENT_NAME: "release",
      GITHUB_REF_NAME: "v2026-10-18.1",
    };
    expect(getUserscriptVersion(directory, release)).toBe("2026-10-18.1");
    expect(
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          join(import.meta.dirname, "../../scripts/version.ts"),
        ],
        {
          cwd: directory,
          env: { ...process.env, ...release },
          encoding: "utf8",
        },
      ).trim(),
    ).toBe("2026-10-18.1");
    expect(
      getUserscriptVersion(directory, {
        ...release,
        GITHUB_REF_NAME: "v2026-10-18",
      }),
    ).toBe("2026-10-18");
    git("tag", "-d", "v2026-10-18.1");
    git("commit", "--quiet", "--allow-empty", "-m", "next");
    expect(() =>
      getUserscriptVersion(directory, {
        ...release,
        GITHUB_REF_NAME: "v2026-10-18",
      }),
    ).toThrow("Release tag must point to the checked-out commit");
    expect(getUserscriptVersion(directory, {})).toMatch(
      /^2026-10-18\.1\.dev1\+g[0-9a-f]+$/,
    );
    await writeFile(join(directory, "source.txt"), "dirty");
    expect(getUserscriptVersion(directory, {})).toMatch(/\.d\d{8}$/);
  } finally {
    if (!directory.startsWith(join(tmpdir(), "pdd-test-git-"))) {
      throw new Error("Unexpected temporary directory");
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("release tag validation accepts the same dated versions used by builds", () => {
  for (const tag of [
    "v2026-10-18",
    "v2026-10-18.0",
    "v2026-10-18.1",
    "v2024-02-29.12",
  ]) {
    expect(() => assertReleaseTag(tag)).not.toThrow();
  }
  for (const tag of [
    undefined,
    "2026-10-18",
    "v1.0.0",
    "v2026-10-18.dev1",
    "v2026-10-18.01",
    "v2026-10-18.00",
    "v2026-99-99",
    "v2026-02-29",
    "v2026-04-31",
  ]) {
    expect(() => assertReleaseTag(tag)).toThrow("Expected a release tag");
  }
});
