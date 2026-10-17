import { afterEach, beforeEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getUserscriptVersion } from '../../vite.version.ts';

let directory: string;

function git(...args: string[]) {
  return execFileSync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
  }).trim();
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'pdd-version-'));
  git('init', '--quiet');
  git('config', 'user.name', 'Version test');
  git('config', 'user.email', 'version@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '.no-hooks');
  writeFileSync(join(directory, 'source.txt'), 'initial\n');
  git('add', 'source.txt');
  git('commit', '--quiet', '-m', 'Initial fixture');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('builds an identifiable development version before the first tag', () => {
  expect(getUserscriptVersion(directory)).toMatch(/^0\.1\.dev1\+g[0-9a-f]+$/);
});

it('uses a clean release tag exactly', () => {
  git('tag', 'v2026-10-18.1');
  expect(getUserscriptVersion(directory)).toBe('2026-10-18.1');
});

it('marks commits after a tag as development builds', () => {
  git('tag', 'v2026-10-18.1');
  git('commit', '--quiet', '--allow-empty', '-m', 'Development change');
  expect(getUserscriptVersion(directory)).toMatch(
    /^2026-10-18\.2\.dev1\+g[0-9a-f]+$/,
  );
  writeFileSync(join(directory, 'source.txt'), 'uncommitted change\n');
  expect(getUserscriptVersion(directory)).toMatch(
    /^2026-10-18\.2\.dev1\+g[0-9a-f]+\.d\d{8}$/,
  );
});

it('marks tracked changes as dirty', () => {
  git('tag', 'v2026-10-18.1');
  writeFileSync(join(directory, 'source.txt'), 'modified\n');
  expect(getUserscriptVersion(directory)).toMatch(/^2026-10-18\.1\+d\d{8}$/);
});

it('ignores tags outside the release naming convention', () => {
  git('tag', 'latest');
  git('tag', 'v1.0.0-rc.1');
  expect(getUserscriptVersion(directory)).toMatch(/^0\.1\.dev1\+g[0-9a-f]+$/);
});

it('supports date versions with a same-day revision without requiring SemVer', () => {
  git('tag', 'v2026-10-18.2');
  expect(getUserscriptVersion(directory)).toBe('2026-10-18.2');
});

it('supports a date without a revision and advances to revision one for development', () => {
  git('tag', 'v2026-10-18');
  expect(getUserscriptVersion(directory)).toBe('2026-10-18');
  git('commit', '--quiet', '--allow-empty', '-m', 'Development after date tag');
  expect(getUserscriptVersion(directory)).toMatch(
    /^2026-10-18\.1\.dev1\+g[0-9a-f]+$/,
  );
});
