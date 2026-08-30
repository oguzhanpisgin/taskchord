import type { ActiveGoal, IssueContract, RepositoryRef } from "@taskchord/contracts";
import { describe, expect, it } from "vitest";
import { handoffFindings, renderCodexHandoff } from "./handoff.js";

const repository: RepositoryRef = {
  workspaceFolderUri: "file:///repo",
  workspacePath: "C:\\Users\\Alice\\repo",
  nameWithOwner: "owner/repo",
  url: "https://github.com/owner/repo",
  hasIssuesEnabled: true,
  isArchived: false,
  canWrite: true,
};

const contract: IssueContract = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  outcome: "Ship commit 0123456789012345678901234567890123456789",
  boundaries: "Only C:\\Users\\Alice\\repo",
  acceptance: "All checks pass",
  verification: "pnpm validate",
  goal: "Deliver the accepted outcome",
  prefix: "",
  suffix: "",
};

const goal: ActiveGoal = {
  repository: "owner/repo",
  issueNumber: 7,
  issueTitle: "Ship it",
  issueUrl: "https://github.com/owner/repo/issues/7",
  contractId: contract.id,
  goal: contract.goal,
  setAt: "2026-08-30T00:00:00Z",
};

describe("Codex handoff", () => {
  it("is deterministic and preserves user text without redaction", () => {
    const first = renderCodexHandoff(goal, contract, repository);
    expect(renderCodexHandoff(goal, contract, repository)).toBe(first);
    expect(first).toContain("0123456789012345678901234567890123456789");
    expect(first).toContain("C:\\Users\\Alice\\repo");
    expect(first).toContain(goal.issueUrl);
  });

  it("reports every field that blocks handoff, including Goal", () => {
    const findings = handoffFindings("", {
      ...contract,
      outcome: "",
      goal: "",
    });
    expect(findings.map((finding) => finding.field)).toEqual(["title", "outcome", "goal"]);
  });
});
