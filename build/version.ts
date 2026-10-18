import gitDescribe from "git-describe";
import { execFileSync } from "node:child_process";

const releasePattern = /^v(\d{4}-\d{2}-\d{2})(?:\.(?:0|[1-9]\d*))?$/;
const dateTagPattern = "v[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]";

function isReleaseTag(tag: string | null | undefined): tag is string {
  const date = releasePattern.exec(tag ?? "")?.[1];
  if (!date) return false;
  const timestamp = Date.parse(date);
  // Date.parse 会将部分越界日期顺延，回转比较才能拒绝这些输入。
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === date
  );
}

export function assertReleaseTag(
  tag: string | undefined,
): asserts tag is string {
  if (!isReleaseTag(tag)) {
    throw new Error(
      "Expected a release tag in vYYYY-MM-DD or vYYYY-MM-DD.N format, with a valid date and no leading zeros in N.",
    );
  }
}

/** 发布采用触发 Release 的 tag；其他构建推导提交距离、哈希及脏状态。 */
export function getUserscriptVersion(
  directory: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const info = gitDescribe.gitDescribeSync(directory, {
    match: dateTagPattern,
    customArguments: ["--match", `${dateTagPattern}.[0-9]*`],
  });
  if (!/^g?[0-9a-f]{7,40}$/i.test(info.hash ?? "")) {
    throw new Error(
      "Cannot determine Git version. Build from a Git checkout with history and tags.",
    );
  }

  const dirtyDate = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  if (environment.GITHUB_EVENT_NAME === "release") {
    // 同一提交可能有多个 tag，git describe 选择的未必是本次发布版本。
    const tag = environment.GITHUB_REF_NAME;
    assertReleaseTag(tag);
    const currentTag = execFileSync(
      "git",
      ["-C", directory, "tag", "--points-at", "HEAD", "--list", tag],
      { encoding: "utf8" },
    ).trim();
    if (currentTag !== tag) {
      throw new Error("Release tag must point to the checked-out commit.");
    }
    return tag.slice(1) + (info.dirty ? `+d${dirtyDate}` : "");
  }
  const baseVersion = isReleaseTag(info.tag) ? info.tag.slice(1) : undefined;
  if (baseVersion && info.distance === 0) {
    return info.dirty ? `${baseVersion}+d${dirtyDate}` : baseVersion;
  }
  let nextVersion = "0.1";
  if (baseVersion) {
    nextVersion = baseVersion.includes(".")
      ? baseVersion.replace(/\d+$/, (revision) => String(BigInt(revision) + 1n))
      : `${baseVersion}.1`;
  }
  const distance =
    info.distance ??
    execFileSync("git", ["-C", directory, "rev-list", "--count", "HEAD"], {
      encoding: "utf8",
    }).trim();
  const hash = info.hash.startsWith("g") ? info.hash : `g${info.hash}`;
  return `${nextVersion}.dev${distance}+${hash}${info.dirty ? `.d${dirtyDate}` : ""}`;
}
