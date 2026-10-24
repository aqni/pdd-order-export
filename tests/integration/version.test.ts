import { afterEach, test, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getUserscriptVersion } from "../../build/version";

afterEach(() => vi.unstubAllEnvs());

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
    vi.stubEnv("GITHUB_EVENT_NAME", "release");
    for (const tag of [
      "v2026-10-18",
      "v2026-10-18.0",
      "v2026-10-18.1",
      "v2024-02-29.12",
    ]) {
      git("tag", tag);
      vi.stubEnv("GITHUB_REF_NAME", tag);
      expect(getUserscriptVersion(directory)).toBe(tag.slice(1));
      git("tag", "-d", tag);
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
      vi.stubEnv("GITHUB_REF_NAME", tag);
      expect(() => getUserscriptVersion(directory)).toThrow(
        "Expected a release tag",
      );
    }
    vi.stubEnv("GITHUB_EVENT_NAME", undefined);
    vi.stubEnv("GITHUB_REF_NAME", undefined);
    git("tag", "v2026-10-18");
    expect(getUserscriptVersion(directory)).toBe("2026-10-18");
    git("tag", "v2026-10-18.1");
    vi.stubEnv("GITHUB_EVENT_NAME", "release");
    vi.stubEnv("GITHUB_REF_NAME", "v2026-10-18.1");
    expect(getUserscriptVersion(directory)).toBe("2026-10-18.1");
    expect(
      execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          join(import.meta.dirname, "../../scripts/version.ts"),
        ],
        {
          cwd: directory,
          encoding: "utf8",
        },
      ).trim(),
    ).toBe("2026-10-18.1");
    vi.stubEnv("GITHUB_REF_NAME", "v2026-10-18");
    expect(getUserscriptVersion(directory)).toBe("2026-10-18");
    git("tag", "-d", "v2026-10-18.1");
    git("commit", "--quiet", "--allow-empty", "-m", "next");
    expect(() => getUserscriptVersion(directory)).toThrow(
      "Release tag must point to the checked-out commit",
    );
    vi.stubEnv("GITHUB_EVENT_NAME", undefined);
    vi.stubEnv("GITHUB_REF_NAME", undefined);
    expect(getUserscriptVersion(directory)).toMatch(
      /^2026-10-18\.1\.dev1\+g[0-9a-f]+$/,
    );
    await writeFile(join(directory, "source.txt"), "dirty");
    expect(getUserscriptVersion(directory)).toMatch(/\.d\d{8}$/);
  } finally {
    if (!directory.startsWith(join(tmpdir(), "pdd-test-git-"))) {
      throw new Error("Unexpected temporary directory");
    }
    await rm(directory, { recursive: true, force: true });
  }
});
