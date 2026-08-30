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
  decidedAt?: string;
  evidenceFingerprint?: string;
}

export interface ProofReport {
  schemaVersion: typeof PROOF_SCHEMA_VERSION;
  generatedAt: string;
  subject: ProofSubject;
  fingerprint: string;
  technicalFingerprint: string;
  strips: Readonly<Record<ProofStripId, ProofStrip>>;
  technicalReadiness: TechnicalReadiness;
  humanDecision: HumanDecisionRecord;
  unresolvedTechnicalStrips: readonly ProofStripId[];
}

export type VerificationKind = "build" | "tests";
export type SupportedPackageManager = "pnpm" | "npm" | "yarn";

export interface VerificationScript {
  kind: VerificationKind;
  name: string;
  body: string;
  definitionHash: string;
  manager: SupportedPackageManager;
  runnerCommand: readonly string[];
}

export type VerificationScriptDiscovery =
  | { ok: true; manager: SupportedPackageManager; scripts: readonly VerificationScript[] }
  | { ok: false; reason: string };

export interface VerificationRunRecord {
  kind: VerificationKind;
  scriptName: string;
  definitionHash: string;
  runnerCommand: readonly string[];
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  startFingerprint: string;
  endFingerprint: string;
}

export interface ProofEvidenceInput {
  scripts: readonly VerificationScript[];
  build?: VerificationRunRecord;
  tests?: VerificationRunRecord;
  humanDecision?: HumanDecisionRecord;
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

function fingerprintTechnicalEvidence(
  workspaceFingerprint: string,
  subject: ProofSubject,
  strips: Readonly<Record<ProofStripId, ProofStrip>>,
): string {
  const technical = TECHNICAL_STRIPS.map((id) => {
    const evidence = strips[id];
    return [id, evidence.status, evidence.summary, ...evidence.details];
  });
  return createHash("sha256")
    .update(workspaceFingerprint)
    .update("\0")
    .update(subject.repository)
    .update("\0")
    .update(subject.branch)
    .update("\0")
    .update(subject.headSha)
    .update("\0")
    .update(JSON.stringify(technical))
    .digest("hex");
}

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
  const technicalFingerprint = fingerprintTechnicalEvidence(git.fingerprint, git.subject, strips);
  return {
    schemaVersion: PROOF_SCHEMA_VERSION,
    generatedAt: git.observedAt,
    subject: git.subject,
    fingerprint: git.fingerprint,
    technicalFingerprint,
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
  const technicalFingerprint = fingerprintTechnicalEvidence(fingerprint, subject, strips);
  return {
    schemaVersion: PROOF_SCHEMA_VERSION,
    generatedAt: observedAt,
    subject,
    fingerprint,
    technicalFingerprint,
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

function packageManagerFromDeclaration(value: unknown): SupportedPackageManager | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(pnpm|npm|yarn)(?:@|$)/u.exec(value.trim());
  return match?.[1] as SupportedPackageManager | undefined;
}

function packageManagerFromLockfiles(
  lockfiles: readonly string[],
): SupportedPackageManager | undefined {
  const managers = new Set<SupportedPackageManager>();
  for (const lockfile of lockfiles) {
    if (lockfile === "pnpm-lock.yaml") managers.add("pnpm");
    if (lockfile === "package-lock.json" || lockfile === "npm-shrinkwrap.json") managers.add("npm");
    if (lockfile === "yarn.lock") managers.add("yarn");
  }
  return managers.size === 1 ? [...managers][0] : undefined;
}

export function discoverVerificationScripts(
  packageJsonText: string,
  presentLockfiles: readonly string[],
): VerificationScriptDiscovery {
  let manifest: unknown;
  try {
    manifest = JSON.parse(packageJsonText);
  } catch {
    return { ok: false, reason: "package.json is not valid JSON." };
  }
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    return { ok: false, reason: "package.json must contain an object." };
  }
  const record = manifest as Record<string, unknown>;
  const declared = record.packageManager;
  const manager =
    declared === undefined
      ? packageManagerFromLockfiles(presentLockfiles)
      : packageManagerFromDeclaration(declared);
  if (manager === undefined) {
    return {
      ok: false,
      reason:
        declared === undefined
          ? "A single pnpm, npm, or yarn lockfile is required."
          : "packageManager must declare pnpm, npm, or yarn.",
    };
  }
  const rawScripts = record.scripts;
  if (typeof rawScripts !== "object" || rawScripts === null || Array.isArray(rawScripts)) {
    return { ok: true, manager, scripts: [] };
  }
  const scripts: VerificationScript[] = [];
  for (const [name, body] of Object.entries(rawScripts as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    if (typeof body !== "string") continue;
    const kind: VerificationKind | undefined =
      name === "build" || name.startsWith("build:")
        ? "build"
        : name === "test" || name.startsWith("test:")
          ? "tests"
          : undefined;
    if (kind === undefined) continue;
    const definitionHash = createHash("sha256")
      .update(manager)
      .update("\0")
      .update(name)
      .update("\0")
      .update(body)
      .digest("hex");
    scripts.push({
      kind,
      name,
      body,
      definitionHash,
      manager,
      runnerCommand: [manager, "run", name],
    });
  }
  return { ok: true, manager, scripts };
}

function renderArg(value: string): string {
  return /^[A-Za-z0-9._:@/+\-=]+$/u.test(value) ? value : `'${value.replaceAll("'", "''")}'`;
}

export function renderRunnerCommand(command: readonly string[]): string {
  return command.map(renderArg).join(" ");
}

export function renderVerificationPreview(input: {
  packageJsonPath: string;
  cwd: string;
  script: VerificationScript;
}): string {
  return `${[
    "# TaskChord Proof Verification Preview",
    "",
    `**Kind:** ${input.script.kind}`,
    `**package.json:** ${input.packageJsonPath}`,
    `**Working directory:** ${input.cwd}`,
    `**Package manager:** ${input.script.manager}`,
    `**Script name:** ${input.script.name}`,
    `**Script body:** \`${input.script.body.replaceAll("`", "\\`")}\``,
    `**Command:** \`${renderRunnerCommand(input.script.runnerCommand)}\``,
    "",
    "TaskChord will run only this package script after separate confirmation.",
    "",
  ].join("\n")}\n`;
}

function verificationStrip(
  kind: VerificationKind,
  report: ProofReport,
  run: VerificationRunRecord | undefined,
  scripts: readonly VerificationScript[],
): ProofStrip {
  const observedAt = run?.finishedAt ?? report.generatedAt;
  if (run === undefined) {
    return strip(
      kind,
      "missing",
      `${kind === "build" ? "Build has" : "Tests have"} not been run by TaskChord.`,
      observedAt,
    );
  }
  const current = scripts.find((script) => script.kind === kind && script.name === run.scriptName);
  const details = [
    `Script: ${run.scriptName}`,
    `Runner: ${renderRunnerCommand(run.runnerCommand)}`,
    `Started: ${run.startedAt}`,
    `Finished: ${run.finishedAt}`,
    `Exit code: ${run.exitCode ?? "not reported"}`,
  ];
  if (current === undefined || current.definitionHash !== run.definitionHash) {
    return strip(
      kind,
      "stale",
      "The package script definition changed or was removed.",
      observedAt,
      details,
    );
  }
  if (report.fingerprint !== run.endFingerprint) {
    return strip(
      kind,
      "stale",
      "The workspace changed after this verification run.",
      observedAt,
      details,
    );
  }
  if (run.startFingerprint !== run.endFingerprint) {
    return strip(
      kind,
      "unverified",
      "The workspace changed while this verification ran.",
      observedAt,
      details,
    );
  }
  if (run.exitCode === null) {
    return strip(
      kind,
      "unverified",
      "The verification task did not report an exit code.",
      observedAt,
      details,
    );
  }
  if (run.exitCode !== 0) {
    return strip(
      kind,
      "failed",
      `The verification task exited with code ${run.exitCode}.`,
      observedAt,
      details,
    );
  }
  return strip(
    kind,
    "passed",
    `TaskChord ran ${run.scriptName} successfully.`,
    observedAt,
    details,
  );
}

function humanDecisionStrip(
  decision: HumanDecisionRecord | undefined,
  technicalFingerprint: string,
  observedAt: string,
): { record: HumanDecisionRecord; evidence: ProofStrip } {
  if (
    decision === undefined ||
    decision.decision === "pending" ||
    decision.evidenceFingerprint === undefined
  ) {
    return {
      record: { decision: "pending" },
      evidence: strip("human-decision", "pending", "Human decision is pending.", observedAt),
    };
  }
  if (decision.evidenceFingerprint !== technicalFingerprint || decision.decision === "stale") {
    return {
      record: { ...decision, decision: "stale" },
      evidence: strip(
        "human-decision",
        "stale",
        "The previous human decision no longer matches the current proof.",
        decision.decidedAt ?? observedAt,
      ),
    };
  }
  if (decision.decision === "changes-requested") {
    return {
      record: decision,
      evidence: strip(
        "human-decision",
        "failed",
        "A human requested changes for this proof.",
        decision.decidedAt ?? observedAt,
      ),
    };
  }
  return {
    record: decision,
    evidence: strip(
      "human-decision",
      "passed",
      "A human accepted this proof.",
      decision.decidedAt ?? observedAt,
    ),
  };
}

export function applyProofEvidence(passive: ProofReport, input: ProofEvidenceInput): ProofReport {
  const technicalStrips: Readonly<Record<ProofStripId, ProofStrip>> = {
    ...passive.strips,
    build: verificationStrip("build", passive, input.build, input.scripts),
    tests: verificationStrip("tests", passive, input.tests, input.scripts),
  };
  const technicalFingerprint = fingerprintTechnicalEvidence(
    passive.fingerprint,
    passive.subject,
    technicalStrips,
  );
  const human = humanDecisionStrip(input.humanDecision, technicalFingerprint, passive.generatedAt);
  const strips: Readonly<Record<ProofStripId, ProofStrip>> = {
    ...technicalStrips,
    "human-decision": human.evidence,
  };
  const unresolvedTechnicalStrips = TECHNICAL_STRIPS.filter((id) => strips[id].status !== "passed");
  return {
    ...passive,
    strips,
    technicalFingerprint,
    technicalReadiness:
      unresolvedTechnicalStrips.length === 0 ? "ready-for-human-review" : "not-ready",
    humanDecision: human.record,
    unresolvedTechnicalStrips,
  };
}

export function createHumanDecision(
  decision: "accepted" | "changes-requested",
  technicalFingerprint: string,
  now = new Date(),
): HumanDecisionRecord {
  return {
    decision,
    decidedAt: now.toISOString(),
    evidenceFingerprint: technicalFingerprint,
  };
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
    `**Technical fingerprint:** ${report.technicalFingerprint}`,
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
