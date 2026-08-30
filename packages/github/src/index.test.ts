import type { ProbeRequest, ProbeResult, ProcessProbe } from "@taskchord/doctor";
import { describe, expect, it } from "vitest";
import { confirmIssueWrite, createGitHubClient, parseGitHubRemote } from "./index.js";

function completed(stdout: string, exitCode = 0, stderr = ""): ProbeResult {
  return { outcome: "completed", exitCode, stdout, stderr, durationMs: 1 };
}

function fake(handler: (request: ProbeRequest) => ProbeResult): ProcessProbe {
  return { run: async (request) => handler(request) };
}

const repoJson = JSON.stringify({
  nameWithOwner: "owner/repo",
  url: "https://github.com/owner/repo",
  hasIssuesEnabled: true,
  isArchived: false,
  viewerPermission: "WRITE",
});

const repository = {
  workspaceFolderUri: "file:///repo",
  workspacePath: "C:\\repo",
  nameWithOwner: "owner/repo",
  url: "https://github.com/owner/repo",
  hasIssuesEnabled: true,
  isArchived: false,
  canWrite: true,
};

const marker = "<!-- taskchord:contract v=1 id=123e4567-e89b-12d3-a456-426614174000 -->";

function issueJson(title = "Issue", body = marker): string {
  return JSON.stringify({
    number: 7,
    title,
    body,
    url: "https://github.com/owner/repo/issues/7",
    updatedAt: "2026-08-30T12:00:00Z",
    author: { login: "owner" },
  });
}

describe("parseGitHubRemote", () => {
  it.each([
    ["https://github.com/owner/repo.git", "owner/repo"],
    ["git@github.com:owner/repo.git", "owner/repo"],
    ["ssh://git@github.com/owner/repo", "owner/repo"],
    ["https://example.com/owner/repo", undefined],
  ])("parses %s", (remote, expected) => {
    expect(parseGitHubRemote(remote)).toBe(expected);
  });
});

describe("GitHubClient read operations", () => {
  it("resolves the explicit origin repository and lists open issues", async () => {
    const requests: ProbeRequest[] = [];
    const probe = fake((request) => {
      requests.push(request);
      const key = `${request.command} ${request.args.join(" ")}`;
      if (key === "git remote get-url origin") {
        return completed("git@github.com:owner/repo.git\n");
      }
      if (key.startsWith("gh repo view")) {
        return completed(repoJson);
      }
      return completed(
        JSON.stringify([
          {
            number: 7,
            title: "Issue",
            body: "Body",
            url: "https://github.com/owner/repo/issues/7",
            updatedAt: "2026-08-30T12:00:00Z",
            author: { login: "owner" },
          },
        ]),
      );
    });
    const client = createGitHubClient(probe);
    const repository = await client.resolveRepository("file:///repo", "C:\\repo");
    expect(repository.ok).toBe(true);
    if (!repository.ok) {
      return;
    }
    const issues = await client.listOpenIssues(repository.value);
    expect(issues).toMatchObject({ ok: true, value: { truncated: false } });
    expect(requests[1]?.args).toContain("owner/repo");
    expect(requests[2]?.args).toEqual([
      "issue",
      "list",
      "-R",
      "owner/repo",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,title,body,url,updatedAt,author",
    ]);
  });

  it("rejects unsupported remotes and malformed JSON", async () => {
    const unsupported = createGitHubClient(fake(() => completed("https://example.com/o/r\n")));
    expect(await unsupported.resolveRepository("file:///repo", "C:\\repo")).toMatchObject({
      ok: false,
      failure: { kind: "not-found" },
    });

    const malformed = createGitHubClient(
      fake((request) =>
        request.command === "git"
          ? completed("https://github.com/owner/repo\n")
          : completed("not-json"),
      ),
    );
    expect(await malformed.resolveRepository("file:///repo", "C:\\repo")).toMatchObject({
      ok: false,
      failure: { kind: "invalid-output" },
    });
  });

  it("maps denied and authentication failures without exposing raw credentials", async () => {
    const denied = createGitHubClient(
      fake((request) =>
        request.command === "git"
          ? completed("https://github.com/owner/repo\n")
          : { outcome: "denied", exitCode: null, stdout: "", stderr: "", durationMs: 0 },
      ),
    );
    expect(await denied.resolveRepository("file:///repo", "C:\\repo")).toMatchObject({
      ok: false,
      failure: { kind: "denied" },
    });

    const unauthenticated = createGitHubClient(
      fake((request) =>
        request.command === "git"
          ? completed("https://github.com/owner/repo\n")
          : completed("", 4, "token=ghp_1234567890abcdefghijkl"),
      ),
    );
    const result = await unauthenticated.resolveRepository("file:///repo", "C:\\repo");
    expect(result).toMatchObject({ ok: false, failure: { kind: "unauthenticated" } });
    expect(JSON.stringify(result)).not.toContain("ghp_");
  });
});

describe("GitHubClient approved writes", () => {
  it("uses fixed create argv and passes the exact body on stdin", async () => {
    const requests: ProbeRequest[] = [];
    const client = createGitHubClient(
      fake((request) => {
        requests.push(request);
        return request.args[1] === "create"
          ? completed("https://github.com/owner/repo/issues/7\n")
          : completed(issueJson("Exact title", `${marker}\nbody`));
      }),
    );
    const body = `${marker}\nbody`;
    const result = await client.createIssue(
      confirmIssueWrite({ repository, mode: "create", title: "Exact title", body, findings: [] }),
    );
    expect(result).toMatchObject({ ok: true, value: { resolution: "created" } });
    expect(requests[0]).toMatchObject({
      args: ["issue", "create", "-R", "owner/repo", "--title", "Exact title", "--body-file", "-"],
      stdin: body,
    });
  });

  it("reconciles an ambiguous create without issuing a duplicate create", async () => {
    const requests: ProbeRequest[] = [];
    const client = createGitHubClient(
      fake((request) => {
        requests.push(request);
        if (request.args[1] === "create") {
          return { outcome: "timeout", exitCode: null, stdout: "", stderr: "", durationMs: 1 };
        }
        return completed(`[${issueJson()}]`);
      }),
    );
    const result = await client.createIssue(
      confirmIssueWrite({ repository, mode: "create", title: "Issue", body: marker, findings: [] }),
    );
    expect(result).toMatchObject({ ok: true, value: { resolution: "adopted" } });
    expect(requests.filter((request) => request.args[1] === "create")).toHaveLength(1);
    expect(requests[1]?.args).toContain("all");
  });

  it("reports Unknown result when reconciliation finds no contract marker", async () => {
    const requests: ProbeRequest[] = [];
    const client = createGitHubClient(
      fake((request) => {
        requests.push(request);
        return request.args[1] === "create"
          ? { outcome: "timeout", exitCode: null, stdout: "", stderr: "", durationMs: 1 }
          : completed("[]");
      }),
    );
    const result = await client.createIssue(
      confirmIssueWrite({ repository, mode: "create", title: "Issue", body: marker, findings: [] }),
    );
    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "ambiguous", detail: expect.stringContaining("Unknown result") },
    });
    expect(requests.filter((request) => request.args[1] === "create")).toHaveLength(1);
  });

  it("stops an edit conflict before invoking gh issue edit", async () => {
    const requests: ProbeRequest[] = [];
    const client = createGitHubClient(
      fake((request) => {
        requests.push(request);
        return completed(issueJson("Changed remotely", marker));
      }),
    );
    const result = await client.editIssue(
      confirmIssueWrite({
        repository,
        mode: "edit",
        issueNumber: 7,
        title: "New title",
        body: `${marker}\nnew`,
        findings: [],
        baseTitle: "Original",
        baseBody: marker,
      }),
    );
    expect(result).toMatchObject({ ok: false, failure: { kind: "ambiguous" } });
    expect(requests.some((request) => request.args[1] === "edit")).toBe(false);
  });

  it("accepts an ambiguous edit only when readback exactly matches", async () => {
    const requests: ProbeRequest[] = [];
    let reads = 0;
    const targetBody = `${marker}\nnew`;
    const client = createGitHubClient(
      fake((request) => {
        requests.push(request);
        if (request.args[1] === "edit") {
          return { outcome: "timeout", exitCode: null, stdout: "", stderr: "", durationMs: 1 };
        }
        reads += 1;
        return completed(
          reads === 1 ? issueJson("Original", marker) : issueJson("New title", targetBody),
        );
      }),
    );
    const result = await client.editIssue(
      confirmIssueWrite({
        repository,
        mode: "edit",
        issueNumber: 7,
        title: "New title",
        body: targetBody,
        findings: [],
        baseTitle: "Original",
        baseBody: marker,
      }),
    );
    expect(result).toMatchObject({ ok: true, value: { resolution: "verified" } });
    expect(requests.find((request) => request.args[1] === "edit")).toMatchObject({
      args: ["issue", "edit", "7", "-R", "owner/repo", "--title", "New title", "--body-file", "-"],
      stdin: targetBody,
    });
  });
});
