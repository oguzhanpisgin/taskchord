import { createPassiveProofReport, type GitProofEvidence } from "@taskchord/proof";
import { describe, expect, it } from "vitest";
import { toProofTreeModels } from "./proofModel.js";

describe("Proof tree model", () => {
  it("shows a summary followed by all six evidence strips", () => {
    const git: GitProofEvidence = {
      subject: {
        workspaceFolderUri: "file:///repo",
        repository: "owner/repo",
        branch: "feature",
        headSha: "0123456789abcdef0123456789abcdef01234567",
        baseBranch: "main",
        detached: false,
      },
      fingerprint: "fingerprint",
      files: [{ path: "src/a.ts", status: "M", source: "committed" }],
      filesTruncated: false,
      treeDirty: false,
      hasCommittedDelta: true,
      commitSummary: "0123456 Proof",
      observedAt: "2026-08-30T00:00:00.000Z",
    };
    const report = createPassiveProofReport(git, {
      kind: "missing",
      summary: "No matching pull request was found.",
    });
    const models = toProofTreeModels({ kind: "ready", report });
    expect(models).toHaveLength(7);
    expect(models[0]).toMatchObject({ kind: "summary", label: "Not ready for human review" });
    expect(models.slice(1).map((model) => model.kind)).toEqual(Array(6).fill("strip"));
  });
});
