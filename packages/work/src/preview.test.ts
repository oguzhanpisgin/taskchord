import type { RepositoryRef } from "@taskchord/contracts";
import { describe, expect, it } from "vitest";
import { renderIssueWritePreview } from "./preview.js";

const repository: RepositoryRef = {
  workspaceFolderUri: "file:///repo",
  workspacePath: "C:\\repo",
  nameWithOwner: "owner/repo",
  url: "https://github.com/owner/repo",
  hasIssuesEnabled: true,
  isArchived: false,
  canWrite: true,
};

describe("write preview", () => {
  it("contains the exact unredacted title and body", () => {
    const body = "Commit 0123456789012345678901234567890123456789 at C:\\Users\\Alice\\repo\n";
    const preview = renderIssueWritePreview({
      repository,
      mode: "create",
      title: "Exact title",
      body,
      findings: [],
    });
    expect(preview).toContain("Exact title");
    expect(preview).toContain(body);
    expect(preview).toContain("C:\\Users\\Alice\\repo");
    expect(preview).toContain("0123456789012345678901234567890123456789");
  });

  it("shows a recommended Goal gap instead of claiming the scaffold is complete", () => {
    const preview = renderIssueWritePreview({
      repository,
      mode: "edit",
      issueNumber: 7,
      title: "Ready contract",
      body: "body",
      findings: [
        {
          field: "goal",
          severity: "recommended",
          message: "Goal is empty.",
          example: "Ship the selected outcome.",
        },
      ],
    });
    expect(preview).toContain("recommended: goal");
    expect(preview).not.toContain("Intent Scaffold: Complete");
  });
});
