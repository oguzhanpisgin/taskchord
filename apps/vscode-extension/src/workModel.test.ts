import type { RepositoryRef, WorkItem } from "@taskchord/contracts";
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
    expect(models.map((model) => (model.kind === "issue" ? model.description : ""))).toEqual([
      "Contract",
      "Unstructured",
    ]);
  });

  it("makes the 100-Issue limit visible", () => {
    const models = toWorkTreeModels({
      kind: "ready",
      repository,
      items: [],
      truncated: true,
    });
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
    expect(models[0]).toMatchObject({ kind: "message", icon: "target" });
  });
});
