import type { ProbeRequest, ProbeResult, ProcessProbe } from "@taskchord/doctor";
import { describe, expect, it } from "vitest";
import { createGitHubClient, parseGitHubRemote } from "./index.js";

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
