import type { IssueContract, ScaffoldFinding } from "@taskchord/contracts";

const REQUIRED = [
  ["title", "Describe the observable work result."],
  ["outcome", "The command succeeds and the user sees the completed result."],
  ["boundaries", "Do not change unrelated files or perform external writes without approval."],
  ["acceptance", "The requested behavior is covered by automated tests."],
  ["verification", "Run the focused tests and the repository validation command."],
] as const;

function isEmpty(value: string): boolean {
  return value.replace(/<!--.*?-->/gu, "").trim().length === 0;
}

export function scaffoldFindings(title: string, contract: IssueContract): ScaffoldFinding[] {
  const values: Record<string, string> = { title, ...contract };
  const findings: ScaffoldFinding[] = [];
  for (const [field, example] of REQUIRED) {
    if (isEmpty(values[field] ?? "")) {
      findings.push({
        field,
        severity: "required",
        message: `${field[0]?.toUpperCase()}${field.slice(1)} is empty.`,
        example,
      });
    }
  }
  if (isEmpty(contract.goal)) {
    findings.push({
      field: "goal",
      severity: "recommended",
      message: "Goal is empty.",
      example: "Keep the issue contract intact while delivering the accepted outcome.",
    });
  }
  return findings;
}
