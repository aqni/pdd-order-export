import gitDescribe from 'git-describe';
import { execFileSync } from 'node:child_process';

const releasePattern = /^v\d{4}-\d{2}-\d{2}(?:\.\d+)?$/;
const dateTagPattern = 'v[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';

export function getUserscriptVersion(directory: string) {
  const info = gitDescribe.gitDescribeSync(directory, {
    match: dateTagPattern,
    customArguments: ['--match', `${dateTagPattern}.[0-9]*`],
  });
  if (!/^g?[0-9a-f]{7,40}$/i.test(info.hash ?? '')) {
    throw new Error(
      'Cannot determine Git version. Build from a Git checkout with history and tags.',
    );
  }
  const baseVersion =
    info.tag && releasePattern.test(info.tag) ? info.tag.slice(1) : undefined;
  const dirtyDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  if (baseVersion && info.distance === 0) {
    return info.dirty ? `${baseVersion}+d${dirtyDate}` : baseVersion;
  }
  let nextVersion = '0.1';
  if (baseVersion) {
    nextVersion = baseVersion.includes('.')
      ? baseVersion.replace(/\d+$/, (revision) => String(BigInt(revision) + 1n))
      : `${baseVersion}.1`;
  }
  const distance =
    info.distance ??
    execFileSync('git', ['-C', directory, 'rev-list', '--count', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  const hash = info.hash.startsWith('g') ? info.hash : `g${info.hash}`;
  return `${nextVersion}.dev${distance}+${hash}${info.dirty ? `.d${dirtyDate}` : ''}`;
}
