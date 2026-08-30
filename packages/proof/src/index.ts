import { createHash } from "node:crypto";
import type { ProcessProbe } from "@taskchord/doctor";
import { summarizeOutput } from "@taskchord/doctor";

export const PROOF_SCHEMA_VERSION = 1 as const;
export const PROOF_FILE_LIMIT = 500;
export const PROOF_INPUT_LIMIT_BYTES = 8_388_608;

export type ProofStripId =
  | "changed-files"
  | "build"
  | "tests"
  | "commit"
  | "pr-ci"
  | "human-decision";

export type ProofStripStatus =
  | "passed"
  | "failed"
  | "missing"
  | "pending"
  | "running"
  | "stale"
  | "unverified";

export type TechnicalReadiness = "not-ready" | "ready-for-human-review";
export type HumanDecision = "pending" | "changes-requested" | "accepted" | "stale";

export interface ProofSubject {
  workspaceFolderUri: string;
  repository: string;
  branch: string;
  headSha: string;
  baseBranch?: string;
  detached: boolean;
}

export interface ProofStrip {
  id: ProofStripId;
  label: string;
  status: ProofStripStatus;
  summary: string;
  details: readonly string[];
  observedAt: string;
}

export interface HumanDecisionRecord {
  decision: HumanDecision;
}

export interface ProofReport {
  schemaVersion: typeof PROOF_SCHEMA_VERSION;
  generatedAt: string;
  subject: ProofSubject;
  fingerprint: string;
  strips: Readonly<Record<ProofStripId, ProofStrip>>;
  technicalReadiness: TechnicalReadiness;
  humanDecision: HumanDecisionRecord;
  unresolvedTechnicalStrips: readonly ProofStripId[];
}

export interface ChangedFile {
  path: string;
  status: string;
  source: "committed" | "working-tree";
}

export interface GitProofEvidence {
  subject: ProofSubject;
  fingerprint: string;
  files: readonly ChangedFile[];
  filesTruncated: boolean;
  treeDirty: boolean;
  hasCommittedDelta: boolean;
  commitSummary: string;
  observedAt: string;
}

export type GitProofResult =
  | { ok: true; evidence: GitProofEvidence }
  | { ok: false; summary: string; observedAt: string };

export interface PullRequestCheck {
  name: string;
  status: "passed" | "failed" | "pending" | "unverified";
}

export interface PullRequestProof {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  headSha: string;
  baseBranch: string;
  reviewDecision: string;
  checks: readonly PullRequestCheck[];
}

export type CommitRelation = "equal" | "local-ahead" | "local-behind" | "diverged" | "unknown";

export type PullRequestInput =
  | { kind: "available"; pullRequest: PullRequestProof; relation: CommitRelation }
  | { kind: "missing"; summary: string }
  | { kind: "unverified"; summary: string };

const LABELS: Record<ProofStripId, string> = {
  "changed-files": "Changed files",
  build: "Build",
  tests: "Tests",
  commit: "Commit",
  "pr-ci": "PR / CI",
  "human-decision": "Human decision",
};

const TECHNICAL_STRIPS = ["changed-files", "build", "tests", "commit", "pr-ci"] as const;

function strip(
  id: ProofStripId,
  status: ProofStripStatus,
  summary: string,
  observedAt: string,
  details: readonly string[] = [],
): ProofStrip {
  return { id, label: LABELS[id], status, summary, details, observedAt };
}

function prStrip(input: PullRequestInput, headSha: string, observedAt: string): ProofStrip {
  if (input.kind === "missing") {
    return strip("pr-ci", "missing", input.summary, observedAt);
  }
  if (input.kind === "unverified") {
    return strip("pr-ci", "unverified", input.summary, observedAt);
  }
  const pr = input.pullRequest;
  const details = [
    `PR: #${pr.number} ${pr.title}`,
    `URL: ${pr.url}`,
    `Base: ${pr.baseBranch}`,
    `GitHub review: ${pr.reviewDecision || "not reported"}`,
  ];
  if (pr.headSha !== headSha) {
    if (input.relation === "local-ahead") {
      return strip(
        "pr-ci",
        "pending",
        "The local HEAD has not been pushed to the PR.",
        observedAt,
        details,
      );
    }
    return strip(
      "pr-ci",
      "unverified",
      input.relation === "local-behind"
        ? "The local checkout is behind the PR head."
        : "The local and PR heads could not be reconciled safely.",
      observedAt,
      details,
    );
  }
  if (pr.state === "CLOSED") {
    return strip(
      "pr-ci",
      "failed",
      "The matching PR was closed without merging.",
      observedAt,
      details,
    );
  }
  if (pr.state === "MERGED") {
    return strip("pr-ci", "passed", "The matching PR is merged.", observedAt, details);
  }
  if (pr.isDraft) {
    return strip("pr-ci", "pending", "The matching PR is still a draft.", observedAt, details);
  }
  if (pr.checks.some((check) => check.status === "failed")) {
    return strip("pr-ci", "failed", "One or more CI checks failed.", observedAt, details);
  }
  if (pr.checks.some((check) => check.status === "unverified")) {
    return strip(
      "pr-ci",
      "unverified",
      "One or more CI check conclusions are not acceptable proof.",
      observedAt,
      details,
    );
  }
  if (pr.checks.some((check) => check.status === "pending")) {
    return strip("pr-ci", "pending", "CI checks are still running.", observedAt, details);
  }
  return strip(
    "pr-ci",
    "passed",
    pr.checks.length === 0
      ? "PR is open; CI is not configured or reported."
      : "PR is open and all reported CI checks passed.",
    observedAt,
    [...details, ...pr.checks.map((check) => `${check.name}: ${check.status}`)],
  );
}

export function createPassiveProofReport(
  git: GitProofEvidence,
  pullRequest: PullRequestInput,
): ProofReport {
  const changedFiles =
    git.files.length === 0
      ? strip("changed-files", "missing", "No changed files were found.", git.observedAt)
      : strip(
          "changed-files",
          "passed",
          `${git.files.length} changed file${git.files.length === 1 ? "" : "s"}${git.filesTruncated ? " (truncated)" : ""}.`,
          git.observedAt,
          git.files.map((file) => `${file.status} ${file.path} (${file.source})`),
        );
  const commit = git.subject.detached
    ? strip("commit", "unverified", "The repository is in detached HEAD state.", git.observedAt)
    : git.treeDirty
      ? strip("commit", "pending", "Changes remain uncommitted.", git.observedAt, [
          git.commitSummary,
        ])
      : git.hasCommittedDelta
        ? strip("commit", "passed", git.commitSummary, git.observedAt, [git.subject.headSha])
        : strip(
            "commit",
            "missing",
            "No feature commit exists relative to the base.",
            git.observedAt,
            [git.subject.headSha],
          );
  const strips: Readonly<Record<ProofStripId, ProofStrip>> = {
    "changed-files": changedFiles,
    build: strip("build", "missing", "Build has not been run by TaskChord.", git.observedAt),
    tests: strip("tests", "missing", "Tests have not been run by TaskChord.", git.observedAt),
    commit,
    "pr-ci": prStrip(pullRequest, git.subject.headSha, git.observedAt),
    "human-decision": strip(
      "human-decision",
      "pending",
      "Human decision is pending.",
      git.observedAt,
    ),
  };
  const unresolvedTechnicalStrips = TECHNICAL_STRIPS.filter((id) => strips[id].status !== "passed");
  return {
    schemaVersion: PROOF_SCHEMA_VERSION,
    generatedAt: git.observedAt,
    subject: git.subject,
    fingerprint: git.fingerprint,
    strips,
    technicalReadiness:
      unresolvedTechnicalStrips.length === 0 ? "ready-for-human-review" : "not-ready",
    humanDecision: { decision: "pending" },
    unresolvedTechnicalStrips,
  };
}

export function createUnavailableProofReport(
  subject: ProofSubject,
  summary: string,
  observedAt = new Date().toISOString(),
): ProofReport {
  const fingerprint = createHash("sha256")
    .update(subject.repository)
    .update("\0")
    .update(subject.headSha)
    .digest("hex");
  const strips: Readonly<Record<ProofStripId, ProofStrip>> = {
    "changed-files": strip("changed-files", "unverified", summary, observedAt),
    build: strip("build", "missing", "Build has not been run by TaskChord.", observedAt),
    tests: strip("tests", "missing", "Tests have not been run by TaskChord.", observedAt),
    commit: strip("commit", "unverified", summary, observedAt),
    "pr-ci": strip("pr-ci", "unverified", "PR / CI evidence is unavailable.", observedAt),
    "human-decision": strip("human-decision", "pending", "Human decision is pending.", observedAt),
  };
  return {
    schemaVersion: PROOF_SCHEMA_VERSION,
    generatedAt: observedAt,
    subject,
    fingerprint,
    strips,
    technicalReadiness: "not-ready",
    humanDecision: { decision: "pending" },
    unresolvedTechnicalStrips: [...TECHNICAL_STRIPS],
  };
}

interface StatusEntry {
  path: string;
  code: string;
  deleted: boolean;
}

export function parsePorcelainV2(output: string): readonly StatusEntry[] | undefined {
  const tokens = output.split("\0");
  const entries: StatusEntry[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.length === 0) continue;
    if (token.startsWith("? ")) {
      entries.push({ path: token.slice(2), code: "??", deleted: false });
      continue;
    }
    if (token.startsWith("! ") || token.startsWith("# ")) continue;
    if (token.startsWith("1 ")) {
      const match = /^1 ([^ ]{2}) (?:[^ ]+ ){6}(.+)$/u.exec(token);
      if (match?.[1] === undefined || match[2] === undefined) return undefined;
      entries.push({ path: match[2], code: match[1], deleted: match[1].includes("D") });
      continue;
    }
    if (token.startsWith("2 ")) {
      const match = /^2 ([^ ]{2}) (?:[^ ]+ ){7}(.+)$/u.exec(token);
      if (match?.[1] === undefined || match[2] === undefined) return undefined;
      entries.push({ path: match[2], code: match[1], deleted: match[1].includes("D") });
      index += 1;
      if (tokens[index] === undefined) return undefined;
      continue;
    }
    if (token.startsWith("u ")) {
      const match = /^u ([^ ]{2}) (?:[^ ]+ ){9}(.+)$/u.exec(token);
      if (match?.[1] === undefined || match[2] === undefined) return undefined;
      entries.push({ path: match[2], code: match[1], deleted: false });
      continue;
    }
    return undefined;
  }
  return entries;
}

export function parseNameStatus(output: string): readonly ChangedFile[] | undefined {
  const tokens = output.split("\0").filter((token) => token.length > 0);
  const files: ChangedFile[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index];
    const path = tokens[index + 1];
    if (status === undefined || path === undefined || !/^[A-Z][0-9]*$/u.test(status))
      return undefined;
    if (status.startsWith("R") || status.startsWith("C")) {
      const target = tokens[index + 2];
      if (target === undefined) return undefined;
      files.push({ path: target, status, source: "committed" });
      index += 2;
    } else {
      files.push({ path, status, source: "committed" });
      index += 1;
    }
  }
  return files;
}

function validSha(value: string): string | undefined {
  const trimmed = value.trim();
  return /^[0-9a-f]{40}$/u.test(trimmed) ? trimmed : undefined;
}

async function git(
  probe: ProcessProbe,
  cwd: string,
  args: readonly string[],
  options: { stdin?: string; maxBufferBytes?: number } = {},
) {
  try {
    return await probe.run({
      command: "git",
      args,
      cwd,
      timeoutMs: 8_000,
      maxBufferBytes: options.maxBufferBytes ?? PROOF_INPUT_LIMIT_BYTES,
      ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
    });
  } catch {
    return { outcome: "error" as const, exitCode: null, stdout: "", stderr: "", durationMs: 0 };
  }
}

function failed(summary: string, observedAt: string): GitProofResult {
  return { ok: false, summary, observedAt };
}

function safeBranch(value: string): boolean {
  return /^(?!-)(?!.*\.\.)(?!.*@\{)[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/u.test(value);
}

export async function readGitIdentity(
  probe: ProcessProbe,
  workspacePath: string,
): Promise<{ headSha: string; branch: string; detached: boolean } | undefined> {
  const [head, branch] = await Promise.all([
    git(probe, workspacePath, ["rev-parse", "--verify", "HEAD"]),
    git(probe, workspacePath, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
  ]);
  const headSha =
    head.outcome === "completed" && head.exitCode === 0 ? validSha(head.stdout) : undefined;
  if (headSha === undefined) return undefined;
  const branchName =
    branch.outcome === "completed" && branch.exitCode === 0 ? branch.stdout.trim() : "HEAD";
  if (branchName !== "HEAD" && !safeBranch(branchName)) return undefined;
  return { headSha, branch: branchName, detached: branchName === "HEAD" };
}

export async function readLocalDefaultBranch(
  probe: ProcessProbe,
  workspacePath: string,
): Promise<string | undefined> {
  const result = await git(probe, workspacePath, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (result.outcome !== "completed" || result.exitCode !== 0) return undefined;
  const match = /^origin\/(.+)$/u.exec(result.stdout.trim());
  return match?.[1] !== undefined && safeBranch(match[1]) ? match[1] : undefined;
}

export async function collectGitProof(
  probe: ProcessProbe,
  input: {
    workspaceFolderUri: string;
    workspacePath: string;
    repository: string;
    baseBranch: string;
    now?: Date;
  },
): Promise<GitProofResult> {
  const observedAt = (input.now ?? new Date()).toISOString();
  if (!safeBranch(input.baseBranch))
    return failed("The base branch name is not safe to inspect.", observedAt);
  const identity = await readGitIdentity(probe, input.workspacePath);
  if (identity === undefined) return failed("Git identity could not be verified.", observedAt);
  const baseRef = `refs/remotes/origin/${input.baseBranch}`;
  const [base, status, commitSummary] = await Promise.all([
    git(probe, input.workspacePath, ["merge-base", "HEAD", baseRef]),
    git(probe, input.workspacePath, [
      "--no-optional-locks",
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
    ]),
    git(probe, input.workspacePath, ["log", "-1", "--format=%h %s"]),
  ]);
  const mergeBase =
    base.outcome === "completed" && base.exitCode === 0 ? validSha(base.stdout) : undefined;
  const statusEntries =
    status.outcome === "completed" && status.exitCode === 0
      ? parsePorcelainV2(status.stdout)
      : undefined;
  if (mergeBase === undefined || statusEntries === undefined) {
    return failed("The Git base or working tree could not be verified.", observedAt);
  }
  if (
    statusEntries.length > PROOF_FILE_LIMIT ||
    Buffer.byteLength(status.stdout) > PROOF_INPUT_LIMIT_BYTES
  ) {
    return failed("The working tree exceeds TaskChord Proof inspection limits.", observedAt);
  }
  if (statusEntries.some((entry) => /[\r\n]/u.test(entry.path))) {
    return failed(
      "A changed path contains a newline and cannot be fingerprinted safely.",
      observedAt,
    );
  }
  const committed = await git(probe, input.workspacePath, [
    "-c",
    "diff.external=",
    "diff",
    "--name-status",
    "-z",
    "--no-ext-diff",
    `${mergeBase}..HEAD`,
    "--",
  ]);
  const committedFiles =
    committed.outcome === "completed" && committed.exitCode === 0
      ? parseNameStatus(committed.stdout)
      : undefined;
  if (committedFiles === undefined) {
    return failed("Changed files could not be read safely.", observedAt);
  }
  const hashPaths = statusEntries.filter((entry) => !entry.deleted).map((entry) => entry.path);
  const hashInput = hashPaths.length === 0 ? "" : `${hashPaths.join("\n")}\n`;
  if (Buffer.byteLength(hashInput) > PROOF_INPUT_LIMIT_BYTES) {
    return failed("Changed paths exceed TaskChord Proof fingerprint limits.", observedAt);
  }
  const hashes =
    hashPaths.length === 0
      ? { outcome: "completed" as const, exitCode: 0, stdout: "", stderr: "", durationMs: 0 }
      : await git(probe, input.workspacePath, ["hash-object", "--stdin-paths"], {
          stdin: hashInput,
        });
  if (hashes.outcome !== "completed" || hashes.exitCode !== 0) {
    return failed("Changed file content could not be fingerprinted safely.", observedAt);
  }
  const workingFiles: ChangedFile[] = statusEntries.map((entry) => ({
    path: entry.path,
    status: entry.code,
    source: "working-tree",
  }));
  const byPath = new Map<string, ChangedFile>();
  for (const file of [...committedFiles, ...workingFiles]) byPath.set(file.path, file);
  const allFiles = [...byPath.values()];
  if (allFiles.length > PROOF_FILE_LIMIT) {
    return failed("Changed files exceed TaskChord Proof inspection limits.", observedAt);
  }
  const filesTruncated = false;
  const files = allFiles;
  const fingerprint = createHash("sha256")
    .update(identity.headSha)
    .update("\0")
    .update(status.stdout)
    .update("\0")
    .update(hashes.stdout)
    .digest("hex");
  return {
    ok: true,
    evidence: {
      subject: {
        workspaceFolderUri: input.workspaceFolderUri,
        repository: input.repository,
        branch: identity.branch,
        headSha: identity.headSha,
        baseBranch: input.baseBranch,
        detached: identity.detached,
      },
      fingerprint,
      files,
      filesTruncated,
      treeDirty: statusEntries.length > 0,
      hasCommittedDelta: mergeBase !== identity.headSha,
      commitSummary:
        commitSummary.outcome === "completed" && commitSummary.exitCode === 0
          ? commitSummary.stdout.trim()
          : "Commit metadata was not reported.",
      observedAt,
    },
  };
}

export async function compareCommitRelation(
  probe: ProcessProbe,
  workspacePath: string,
  localHead: string,
  remoteHead: string,
): Promise<CommitRelation> {
  if (validSha(localHead) === undefined || validSha(remoteHead) === undefined) return "unknown";
  if (localHead === remoteHead) return "equal";
  const [remoteIsAncestor, localIsAncestor] = await Promise.all([
    git(probe, workspacePath, ["merge-base", "--is-ancestor", remoteHead, localHead]),
    git(probe, workspacePath, ["merge-base", "--is-ancestor", localHead, remoteHead]),
  ]);
  if (remoteIsAncestor.outcome !== "completed" || localIsAncestor.outcome !== "completed")
    return "unknown";
  if (
    ![0, 1].includes(remoteIsAncestor.exitCode ?? -1) ||
    ![0, 1].includes(localIsAncestor.exitCode ?? -1)
  )
    return "unknown";
  if (remoteIsAncestor.exitCode === 0) return "local-ahead";
  if (localIsAncestor.exitCode === 0) return "local-behind";
  return "diverged";
}

export function renderProofMarkdown(report: ProofReport): string {
  const lines = [
    "# TaskChord Proof",
    "",
    `**Repository:** ${report.subject.repository}`,
    `**Branch:** ${report.subject.branch}`,
    `**HEAD:** ${report.subject.headSha}`,
    `**Base:** ${report.subject.baseBranch ?? "unverified"}`,
    `**Technical readiness:** ${report.technicalReadiness}`,
    `**Human decision:** ${report.humanDecision.decision}`,
    `**Observed:** ${report.generatedAt}`,
    "",
  ];
  for (const id of [
    "changed-files",
    "build",
    "tests",
    "commit",
    "pr-ci",
    "human-decision",
  ] as const) {
    const evidence = report.strips[id];
    lines.push(`## ${evidence.label}`, "", `**${evidence.status}** — ${evidence.summary}`, "");
    for (const detail of evidence.details) lines.push(`- ${detail}`);
    if (evidence.details.length > 0) lines.push("");
  }
  lines.push("## Fingerprint", "", `\`${report.fingerprint}\``, "");
  return `${lines.join("\n")}\n`;
}

export function gitFailureSummary(stderr: string): string {
  return summarizeOutput(stderr) || "Git evidence could not be read safely.";
}
