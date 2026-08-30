import type { GhFailure, GhResult, RemoteIssue, RepositoryRef } from "@taskchord/contracts";
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

export interface GitHubClient {
  resolveRepository(
    workspaceFolderUri: string,
    workspacePath: string,
  ): Promise<GhResult<RepositoryRef>>;
  listOpenIssues(repository: RepositoryRef): Promise<GhResult<IssueList>>;
  viewIssue(repository: RepositoryRef, issueNumber: number): Promise<GhResult<RemoteIssue>>;
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
  return failure("error", detail, "Review GitHub CLI access, then retry.");
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

async function run(probe: ProcessProbe, request: ProbeRequest): Promise<ProbeResult> {
  try {
    return await probe.run(request);
  } catch {
    return { outcome: "error", exitCode: null, stdout: "", stderr: "", durationMs: 0 };
  }
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
    },
  };
}
