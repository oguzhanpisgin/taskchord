import type {
  ConfirmedIssueWrite,
  GhFailure,
  GhResult,
  IssueWriteOutcome,
  IssueWriteSnapshot,
  RemoteIssue,
  RepositoryRef,
} from "@taskchord/contracts";
import {
  type ProbeRequest,
  type ProbeResult,
  type ProcessProbe,
  summarizeOutput,
} from "@taskchord/doctor";

export interface IssueList {
  issues: RemoteIssue[];
  truncated: boolean;
}

export interface GitHubPullRequestCheck {
  name: string;
  status: "passed" | "failed" | "pending" | "unverified";
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  reviewDecision: string;
  updatedAt: string;
  checks: readonly GitHubPullRequestCheck[];
}

export interface GitHubClient {
  resolveRepository(
    workspaceFolderUri: string,
    workspacePath: string,
  ): Promise<GhResult<RepositoryRef>>;
  listOpenIssues(repository: RepositoryRef): Promise<GhResult<IssueList>>;
  viewIssue(repository: RepositoryRef, issueNumber: number): Promise<GhResult<RemoteIssue>>;
  reconcileCreate(
    repository: RepositoryRef,
    contractId: string,
  ): Promise<GhResult<RemoteIssue | null>>;
  createIssue(write: ConfirmedIssueWrite): Promise<GhResult<IssueWriteOutcome>>;
  editIssue(write: ConfirmedIssueWrite): Promise<GhResult<IssueWriteOutcome>>;
  getDefaultBranch(repository: RepositoryRef): Promise<GhResult<string>>;
  findPullRequest(
    repository: RepositoryRef,
    branch: string,
  ): Promise<GhResult<GitHubPullRequest | null>>;
}

export function confirmIssueWrite(snapshot: IssueWriteSnapshot): ConfirmedIssueWrite {
  return snapshot as ConfirmedIssueWrite;
}

function failure(kind: GhFailure["kind"], detail: string, nextAction: string): GhResult<never> {
  return { ok: false, failure: { kind, detail, nextAction } };
}

function processFailure(result: ProbeResult, operation: string): GhResult<never> {
  if (result.outcome === "denied") {
    return failure("denied", `${operation} is disabled.`, "Trust the workspace to use Work.");
  }
  if (result.outcome === "not-found") {
    return failure("missing", "GitHub CLI was not found.", "Install GitHub CLI, then run Doctor.");
  }
  if (result.outcome === "timeout") {
    return failure("timeout", `${operation} timed out.`, "Check the network and retry.");
  }
  if (result.outcome !== "completed") {
    return failure("error", `${operation} could not run.`, "Run Doctor and retry.");
  }
  const detail = summarizeOutput(result.stderr) || `${operation} failed.`;
  if (result.exitCode === 4) {
    return failure("unauthenticated", detail, "Sign in with GitHub CLI, then retry.");
  }
  if (/\b403\b|forbidden|resource not accessible|permission/iu.test(result.stderr)) {
    return failure("forbidden", detail, "Ask a repository administrator for Issue write access.");
  }
  return failure("error", detail, "Review GitHub CLI access, then retry.");
}

function definitelyNotWritten(result: ProbeResult): boolean {
  return (
    result.outcome === "denied" ||
    result.outcome === "not-found" ||
    (result.outcome === "completed" &&
      (result.exitCode === 4 ||
        /\b403\b|forbidden|resource not accessible|permission/iu.test(result.stderr)))
  );
}

function issueNumberFromOutput(output: string): number | undefined {
  const value = /https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/iu.exec(output)?.[1];
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGitHubRemote(remote: string): string | undefined {
  const value = remote.trim();
  const patterns = [
    /^https:\/\/(?:[^/@]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/iu,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/iu,
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/iu,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return `${match[1]}/${match[2]}`;
    }
  }
  return undefined;
}

function parseRepository(
  value: unknown,
  workspaceFolderUri: string,
  workspacePath: string,
): RepositoryRef | undefined {
  if (
    !isRecord(value) ||
    typeof value.nameWithOwner !== "string" ||
    typeof value.url !== "string" ||
    typeof value.hasIssuesEnabled !== "boolean" ||
    typeof value.isArchived !== "boolean" ||
    typeof value.viewerPermission !== "string"
  ) {
    return undefined;
  }
  return {
    workspaceFolderUri,
    workspacePath,
    nameWithOwner: value.nameWithOwner,
    url: value.url,
    hasIssuesEnabled: value.hasIssuesEnabled,
    isArchived: value.isArchived,
    canWrite: ["ADMIN", "MAINTAIN", "WRITE"].includes(value.viewerPermission),
  };
}

function parseIssue(value: unknown): RemoteIssue | undefined {
  if (
    !isRecord(value) ||
    typeof value.number !== "number" ||
    typeof value.title !== "string" ||
    typeof value.body !== "string" ||
    typeof value.url !== "string" ||
    typeof value.updatedAt !== "string" ||
    !isRecord(value.author) ||
    typeof value.author.login !== "string"
  ) {
    return undefined;
  }
  return {
    number: value.number,
    title: value.title,
    body: value.body,
    url: value.url,
    updatedAt: value.updatedAt,
    authorLogin: value.author.login,
  };
}

function parseCheck(value: unknown): GitHubPullRequestCheck | undefined {
  if (!isRecord(value)) return undefined;
  const name =
    typeof value.name === "string"
      ? value.name
      : typeof value.context === "string"
        ? value.context
        : undefined;
  if (name === undefined) return undefined;
  const state =
    typeof value.conclusion === "string"
      ? value.conclusion.toUpperCase()
      : typeof value.state === "string"
        ? value.state.toUpperCase()
        : typeof value.status === "string"
          ? value.status.toUpperCase()
          : "";
  const failed = new Set([
    "FAILURE",
    "FAILED",
    "ERROR",
    "CANCELLED",
    "TIMED_OUT",
    "ACTION_REQUIRED",
  ]);
  const passed = new Set(["SUCCESS", "SUCCESSFUL"]);
  const pending = new Set(["PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING", "REQUESTED"]);
  return {
    name,
    status: failed.has(state)
      ? "failed"
      : passed.has(state)
        ? "passed"
        : pending.has(state)
          ? "pending"
          : "unverified",
  };
}

function parsePullRequest(value: unknown): GitHubPullRequest | undefined {
  if (
    !isRecord(value) ||
    typeof value.number !== "number" ||
    typeof value.title !== "string" ||
    typeof value.url !== "string" ||
    !["OPEN", "MERGED", "CLOSED"].includes(String(value.state)) ||
    typeof value.isDraft !== "boolean" ||
    typeof value.headRefName !== "string" ||
    typeof value.headRefOid !== "string" ||
    !/^[0-9a-f]{40}$/u.test(value.headRefOid) ||
    typeof value.baseRefName !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.statusCheckRollup)
  ) {
    return undefined;
  }
  const checks = value.statusCheckRollup.map(parseCheck);
  if (checks.some((check) => check === undefined)) return undefined;
  return {
    number: value.number,
    title: value.title,
    url: value.url,
    state: value.state as GitHubPullRequest["state"],
    isDraft: value.isDraft,
    headRefName: value.headRefName,
    headRefOid: value.headRefOid,
    baseRefName: value.baseRefName,
    reviewDecision: typeof value.reviewDecision === "string" ? value.reviewDecision : "",
    updatedAt: value.updatedAt,
    checks: checks as GitHubPullRequestCheck[],
  };
}

async function run(probe: ProcessProbe, request: ProbeRequest): Promise<ProbeResult> {
  try {
    return await probe.run(request);
  } catch {
    return { outcome: "error", exitCode: null, stdout: "", stderr: "", durationMs: 0 };
  }
}

function contractId(body: string): string | undefined {
  return /^<!--\s*taskchord:contract\s+v=1\s+id=([A-Za-z0-9._-]{8,80})\s*-->$/imu.exec(body)?.[1];
}

function writePrecondition(
  write: ConfirmedIssueWrite,
  mode: "create" | "edit",
): GhResult<never> | undefined {
  if (write.mode !== mode) {
    return failure("error", `Expected a confirmed ${mode} snapshot.`, "Open a new preview.");
  }
  if (write.repository.isArchived) {
    return failure("archived", "The repository is archived.", "Use an active repository.");
  }
  if (!write.repository.canWrite) {
    return failure(
      "read-only",
      "The stored GitHub session cannot write Issues.",
      "Use an account with write access.",
    );
  }
  return undefined;
}

async function readIssue(
  probe: ProcessProbe,
  repository: RepositoryRef,
  issueNumber: number,
): Promise<GhResult<RemoteIssue>> {
  const result = await run(probe, {
    command: "gh",
    args: [
      "issue",
      "view",
      String(issueNumber),
      "-R",
      repository.nameWithOwner,
      "--json",
      "number,title,body,url,updatedAt,author",
    ],
    cwd: repository.workspacePath,
    timeoutMs: 10_000,
    maxBufferBytes: 2_097_152,
  });
  if (result.outcome !== "completed" || result.exitCode !== 0) {
    return processFailure(result, "Issue reading");
  }
  try {
    const issue = parseIssue(JSON.parse(result.stdout));
    return issue === undefined
      ? failure("invalid-output", "GitHub CLI returned an unknown Issue shape.", "Retry.")
      : { ok: true, value: issue };
  } catch {
    return failure("invalid-output", "GitHub CLI returned invalid Issue data.", "Retry.");
  }
}

async function reconcile(
  probe: ProcessProbe,
  repository: RepositoryRef,
  expectedId: string,
): Promise<GhResult<RemoteIssue | null>> {
  const result = await run(probe, {
    command: "gh",
    args: [
      "issue",
      "list",
      "-R",
      repository.nameWithOwner,
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,title,body,url,updatedAt,author",
    ],
    cwd: repository.workspacePath,
    timeoutMs: 15_000,
    maxBufferBytes: 8_388_608,
  });
  if (result.outcome !== "completed" || result.exitCode !== 0) {
    return processFailure(result, "Create reconciliation");
  }
  let values: unknown;
  try {
    values = JSON.parse(result.stdout);
  } catch {
    return failure("invalid-output", "GitHub CLI returned invalid reconciliation data.", "Retry.");
  }
  if (!Array.isArray(values)) {
    return failure(
      "invalid-output",
      "GitHub CLI returned an unknown reconciliation shape.",
      "Retry.",
    );
  }
  const issues = values.map(parseIssue);
  if (issues.some((issue) => issue === undefined)) {
    return failure("invalid-output", "A reconciled Issue had an unknown shape.", "Retry.");
  }
  const matches = (issues as RemoteIssue[]).filter(
    (issue) => contractId(issue.body) === expectedId,
  );
  if (matches.length > 1) {
    return failure(
      "ambiguous",
      `More than one Issue uses TaskChord contract id ${expectedId}.`,
      "Open the matching Issues on GitHub and resolve the duplicate manually.",
    );
  }
  return { ok: true, value: matches[0] ?? null };
}

export function createGitHubClient(probe: ProcessProbe): GitHubClient {
  return {
    async resolveRepository(workspaceFolderUri, workspacePath) {
      const remote = await run(probe, {
        command: "git",
        args: ["remote", "get-url", "origin"],
        cwd: workspacePath,
        timeoutMs: 3_000,
      });
      if (remote.outcome !== "completed" || remote.exitCode !== 0) {
        return failure(
          "not-found",
          "The workspace has no readable origin remote.",
          "Configure a github.com origin remote, then retry.",
        );
      }
      const nameWithOwner = parseGitHubRemote(remote.stdout);
      if (nameWithOwner === undefined) {
        return failure(
          "not-found",
          "The origin remote is not a supported github.com repository.",
          "Use a github.com origin remote.",
        );
      }
      const result = await run(probe, {
        command: "gh",
        args: [
          "repo",
          "view",
          nameWithOwner,
          "--json",
          "nameWithOwner,url,hasIssuesEnabled,isArchived,viewerPermission",
        ],
        cwd: workspacePath,
        timeoutMs: 10_000,
      });
      if (result.outcome !== "completed" || result.exitCode !== 0) {
        return processFailure(result, "Repository discovery");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        return failure("invalid-output", "GitHub CLI returned invalid repository data.", "Retry.");
      }
      const repository = parseRepository(parsed, workspaceFolderUri, workspacePath);
      if (repository === undefined) {
        return failure(
          "invalid-output",
          "GitHub CLI returned an unknown repository shape.",
          "Retry.",
        );
      }
      if (!repository.hasIssuesEnabled) {
        return failure(
          "issues-disabled",
          "Issues are disabled for this repository.",
          "Enable Issues on GitHub.",
        );
      }
      return { ok: true, value: repository };
    },

    async listOpenIssues(repository) {
      const result = await run(probe, {
        command: "gh",
        args: [
          "issue",
          "list",
          "-R",
          repository.nameWithOwner,
          "--state",
          "open",
          "--limit",
          "100",
          "--json",
          "number,title,body,url,updatedAt,author",
        ],
        cwd: repository.workspacePath,
        timeoutMs: 15_000,
        maxBufferBytes: 8_388_608,
      });
      if (result.outcome !== "completed" || result.exitCode !== 0) {
        return processFailure(result, "Issue listing");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        return failure("invalid-output", "GitHub CLI returned invalid Issue data.", "Retry.");
      }
      if (!Array.isArray(parsed)) {
        return failure(
          "invalid-output",
          "GitHub CLI returned an unknown Issue list shape.",
          "Retry.",
        );
      }
      const issues = parsed.map(parseIssue);
      if (issues.some((issue) => issue === undefined)) {
        return failure("invalid-output", "One or more Issues had an unknown shape.", "Retry.");
      }
      return {
        ok: true,
        value: { issues: issues as RemoteIssue[], truncated: issues.length === 100 },
      };
    },

    async viewIssue(repository, issueNumber) {
      return readIssue(probe, repository, issueNumber);
    },

    async reconcileCreate(repository, expectedId) {
      return reconcile(probe, repository, expectedId);
    },

    async createIssue(write) {
      const invalid = writePrecondition(write, "create");
      if (invalid !== undefined) {
        return invalid;
      }
      const expectedId = contractId(write.body);
      if (expectedId === undefined) {
        return failure(
          "invalid-output",
          "The confirmed body has no supported TaskChord contract id.",
          "Open a new preview from a valid contract draft.",
        );
      }
      const result = await run(probe, {
        command: "gh",
        args: [
          "issue",
          "create",
          "-R",
          write.repository.nameWithOwner,
          "--title",
          write.title,
          "--body-file",
          "-",
        ],
        cwd: write.repository.workspacePath,
        timeoutMs: 20_000,
        stdin: write.body,
        maxBufferBytes: 1_048_576,
      });
      if (result.outcome === "completed" && result.exitCode === 0) {
        const issueNumber = issueNumberFromOutput(result.stdout);
        if (issueNumber !== undefined) {
          const issue = await readIssue(probe, write.repository, issueNumber);
          if (issue.ok) {
            return { ok: true, value: { issue: issue.value, resolution: "created" } };
          }
        }
      } else if (definitelyNotWritten(result)) {
        return processFailure(result, "Issue creation");
      }

      const reconciled = await reconcile(probe, write.repository, expectedId);
      if (!reconciled.ok) {
        return reconciled;
      }
      if (reconciled.value !== null) {
        return {
          ok: true,
          value: { issue: reconciled.value, resolution: "adopted" },
        };
      }
      return failure(
        "ambiguous",
        "Unknown result: no matching Issue was found after the create attempt.",
        "Retry only after another reconciliation and a new explicit approval. GitHub does not provide an idempotency guarantee for this operation.",
      );
    },

    async editIssue(write) {
      const invalid = writePrecondition(write, "edit");
      if (invalid !== undefined) {
        return invalid;
      }
      if (
        write.issueNumber === undefined ||
        write.baseTitle === undefined ||
        write.baseBody === undefined
      ) {
        return failure(
          "error",
          "The confirmed edit has no complete base snapshot.",
          "Reopen the Issue as a new draft.",
        );
      }
      const current = await readIssue(probe, write.repository, write.issueNumber);
      if (!current.ok) {
        return current;
      }
      if (current.value.title !== write.baseTitle || current.value.body !== write.baseBody) {
        return failure(
          "ambiguous",
          "Edit conflict: the GitHub Issue changed after this draft was opened.",
          "Refresh Work and open a new draft from the latest Issue.",
        );
      }
      const result = await run(probe, {
        command: "gh",
        args: [
          "issue",
          "edit",
          String(write.issueNumber),
          "-R",
          write.repository.nameWithOwner,
          "--title",
          write.title,
          "--body-file",
          "-",
        ],
        cwd: write.repository.workspacePath,
        timeoutMs: 20_000,
        stdin: write.body,
        maxBufferBytes: 1_048_576,
      });
      if (
        (result.outcome !== "completed" || result.exitCode !== 0) &&
        definitelyNotWritten(result)
      ) {
        return processFailure(result, "Issue edit");
      }
      const readback = await readIssue(probe, write.repository, write.issueNumber);
      if (
        readback.ok &&
        readback.value.title === write.title &&
        readback.value.body === write.body
      ) {
        return {
          ok: true,
          value: {
            issue: readback.value,
            resolution:
              result.outcome === "completed" && result.exitCode === 0 ? "updated" : "verified",
          },
        };
      }
      return failure(
        "ambiguous",
        "Unknown result: the intended edit could not be verified by reading the Issue again.",
        "Refresh the Issue on GitHub before making another edit attempt.",
      );
    },

    async getDefaultBranch(repository) {
      const result = await run(probe, {
        command: "gh",
        args: ["repo", "view", "-R", repository.nameWithOwner, "--json", "defaultBranchRef"],
        cwd: repository.workspacePath,
        timeoutMs: 10_000,
        maxBufferBytes: 1_048_576,
      });
      if (result.outcome !== "completed" || result.exitCode !== 0) {
        return processFailure(result, "Default branch reading");
      }
      try {
        const parsed: unknown = JSON.parse(result.stdout);
        if (
          !isRecord(parsed) ||
          !isRecord(parsed.defaultBranchRef) ||
          typeof parsed.defaultBranchRef.name !== "string" ||
          parsed.defaultBranchRef.name.length === 0
        ) {
          return failure(
            "invalid-output",
            "GitHub CLI returned an unknown default-branch shape.",
            "Retry.",
          );
        }
        return { ok: true, value: parsed.defaultBranchRef.name };
      } catch {
        return failure(
          "invalid-output",
          "GitHub CLI returned invalid default-branch data.",
          "Retry.",
        );
      }
    },

    async findPullRequest(repository, branch) {
      const result = await run(probe, {
        command: "gh",
        args: [
          "pr",
          "list",
          "-R",
          repository.nameWithOwner,
          "--head",
          branch,
          "--state",
          "all",
          "--limit",
          "10",
          "--json",
          "number,title,url,state,isDraft,headRefName,headRefOid,baseRefName,reviewDecision,updatedAt,statusCheckRollup",
        ],
        cwd: repository.workspacePath,
        timeoutMs: 15_000,
        maxBufferBytes: 4_194_304,
      });
      if (result.outcome !== "completed" || result.exitCode !== 0) {
        return processFailure(result, "Pull request reading");
      }
      try {
        const parsed: unknown = JSON.parse(result.stdout);
        if (!Array.isArray(parsed)) {
          return failure(
            "invalid-output",
            "GitHub CLI returned an unknown pull-request list shape.",
            "Retry.",
          );
        }
        const pullRequests = parsed.map(parsePullRequest);
        if (pullRequests.some((pullRequest) => pullRequest === undefined)) {
          return failure("invalid-output", "A pull request had an unknown shape.", "Retry.");
        }
        const matches = (pullRequests as GitHubPullRequest[]).filter(
          (pullRequest) => pullRequest.headRefName === branch,
        );
        matches.sort((left, right) => {
          const stateRank = (state: GitHubPullRequest["state"]): number =>
            state === "OPEN" ? 0 : state === "MERGED" ? 1 : 2;
          return (
            stateRank(left.state) - stateRank(right.state) ||
            right.updatedAt.localeCompare(left.updatedAt)
          );
        });
        return { ok: true, value: matches[0] ?? null };
      } catch {
        return failure(
          "invalid-output",
          "GitHub CLI returned invalid pull-request data.",
          "Retry.",
        );
      }
    },
  };
}
