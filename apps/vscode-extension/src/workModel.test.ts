import type { RepositoryRef, WorkItem } from "@taskchord/contracts";
import type { OptionalRunnerReport } from "@taskchord/runners";
import { describe, expect, it } from "vitest";
import { toWorkTreeModels } from "./workModel.js";

const repository: RepositoryRef = {
  workspaceFolderUri: "file:///repo",
  workspacePath: "/repo",
  nameWithOwner: "owner/repo",
  url: "https://github.com/owner/repo",
  hasIssuesEnabled: true,
  isArchived: false,
  canWrite: true,
};

const runners: OptionalRunnerReport = {
  schemaVersion: 1,
  symphony: {
    endpoint: "http://127.0.0.1:4000/api/v1/state",
    availability: "ready",
    freshness: "fresh",
    observedAt: "2026-08-30T00:00:00Z",
    counts: { running: 2, blocked: 1, retrying: 0 },
    associations: { current: 1, other: 4, unknown: 2, truncated: false },
    associationRepository: "owner/repo",
  },
  codexAppServer: { availability: "supported", codexVersion: "codex 0.1" },
  fallback: "native-handoff",
};

function issue(kind: WorkItem["parsedBody"]): WorkItem {
  return {
    repository,
    issue: {
      number: 7,
      title: "Ship it",
      body: "body",
      url: "https://github.com/owner/repo/issues/7",
      updatedAt: "2026-08-30T00:00:00Z",
      authorLogin: "owner",
    },
    parsedBody: kind,
  };
}

describe("Work tree model", () => {
  it("distinguishes contracts from ordinary Issues", () => {
    const models = toWorkTreeModels({
      kind: "ready",
      repository,
      items: [
        issue({
          kind: "contract",
          version: 1,
          contract: {
            id: "12345678",
            outcome: "Done",
            boundaries: "Only this",
            acceptance: "Pass",
            verification: "Test",
            goal: "Ship",
            prefix: "",
            suffix: "",
          },
        }),
        issue({ kind: "unstructured" }),
      ],
      truncated: false,
    });
    expect(
      models.filter((model) => model.kind === "issue").map((model) => model.description),
    ).toEqual(["Contract", "Unstructured"]);
  });

  it("makes the 100-Issue limit visible", () => {
    const models = toWorkTreeModels({
      kind: "ready",
      repository,
      items: [],
      truncated: true,
    });
    expect(models).toContainEqual({ kind: "message", label: "No open Issues.", icon: "issues" });
    expect(models.at(-1)).toMatchObject({
      kind: "truncated",
      label: expect.stringContaining("100"),
    });
  });

  it("shows multi-root repository selection and untrusted states", () => {
    expect(toWorkTreeModels({ kind: "select-repository" })[0]).toMatchObject({ icon: "repo" });
    expect(toWorkTreeModels({ kind: "untrusted" })[0]).toMatchObject({ icon: "shield" });
  });

  it("projects the local active Goal ahead of Issue items", () => {
    const models = toWorkTreeModels({
      kind: "ready",
      repository,
      items: [issue({ kind: "unstructured" })],
      truncated: false,
      activeGoal: {
        repository: "owner/repo",
        issueNumber: 7,
        issueTitle: "Ship it",
        issueUrl: "https://github.com/owner/repo/issues/7",
        contractId: "12345678",
        goal: "Deliver the accepted outcome",
        setAt: "2026-08-30T00:00:00Z",
      },
    });
    expect(models[0]).toMatchObject({ kind: "runner" });
    expect(models[1]).toMatchObject({ kind: "message", icon: "target" });
  });

  it("places one compact runner summary above Work items without other-repository identifiers", () => {
    const models = toWorkTreeModels({
      kind: "ready",
      repository,
      items: [issue({ kind: "unstructured" })],
      truncated: false,
      runners,
    });
    const runner = models[0];
    expect(runner).toMatchObject({ kind: "runner", label: "Symphony · READY · FRESH" });
    expect(runner?.kind === "runner" ? runner.description : "").toContain("running 2");
    expect(runner?.kind === "runner" ? runner.description : "").toContain("current 1");
    expect(JSON.stringify(runner)).not.toContain("#42");
  });

  it("shows association counts only when their repository subject matches Work", () => {
    const runner = toWorkTreeModels({
      kind: "ready",
      repository,
      items: [],
      truncated: false,
      runners,
    })[0];
    expect(runner?.kind === "runner" ? runner.description : "").toContain("current 1");
  });

  it("does not reuse association counts from a different repository", () => {
    const runner = toWorkTreeModels({
      kind: "ready",
      repository: { ...repository, nameWithOwner: "other/repo" },
      items: [],
      truncated: false,
      runners,
    })[0];
    const description = runner?.kind === "runner" ? runner.description : "";
    expect(description).toContain("Repository association: unverified");
    expect(description).not.toContain("current 1");
  });

  it("requires a refresh when a runner report has no association subject", () => {
    const { associationRepository: _associationRepository, ...subjectlessSymphony } =
      runners.symphony;
    const runner = toWorkTreeModels({
      kind: "ready",
      repository,
      items: [],
      truncated: false,
      runners: {
        ...runners,
        symphony: subjectlessSymphony,
      },
    })[0];
    expect(runner?.kind === "runner" ? runner.description : "").toContain(
      "Repository association: unverified",
    );
  });

  it("keeps native handoff visible when Symphony is unavailable", () => {
    const models = toWorkTreeModels({
      kind: "ready",
      repository,
      items: [],
      truncated: false,
      runners: {
        ...runners,
        symphony: {
          ...runners.symphony,
          availability: "unavailable",
          freshness: "unknown",
          reason: "Symphony state endpoint could not be reached.",
        },
      },
    });
    const runner = models[0];
    expect(runner?.kind === "runner" ? runner.description : "").toContain(
      "Native handoff remains available",
    );
  });
});
