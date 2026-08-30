import type {
  ActiveGoal,
  IssueContract,
  RepositoryRef,
  ScaffoldFinding,
} from "@taskchord/contracts";
import { scaffoldFindings } from "./scaffold.js";

export function handoffFindings(title: string, contract: IssueContract): ScaffoldFinding[] {
  return scaffoldFindings(title, contract);
}

export function renderCodexHandoff(
  goal: ActiveGoal,
  contract: IssueContract,
  repository: RepositoryRef,
): string {
  return `Work from GitHub issue ${repository.nameWithOwner}#${goal.issueNumber}: ${goal.issueTitle}\n${goal.issueUrl}\n\nGoal\n${contract.goal}\n\nOutcome\n${contract.outcome}\n\nBoundaries\n${contract.boundaries}\n\nAcceptance\n${contract.acceptance}\n\nVerification\n${contract.verification}\n\nWork only inside the stated Boundaries. Do not commit, push, open a PR, or change GitHub metadata without explicit confirmation. Report verification evidence separately.\n`;
}
