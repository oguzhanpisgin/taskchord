import type { RepositoryRef, ScaffoldFinding } from "@taskchord/contracts";

export interface IssueWritePreviewInput {
  repository: RepositoryRef;
  mode: "create" | "edit";
  issueNumber?: number;
  title: string;
  body: string;
  findings: readonly ScaffoldFinding[];
}

export function renderIssueWritePreview(input: IssueWritePreviewInput): string {
  const action =
    input.mode === "create" ? "Create issue" : `Edit issue #${input.issueNumber ?? "?"}`;
  const missing =
    input.findings.length === 0
      ? "Complete"
      : input.findings.map((finding) => `${finding.severity}: ${finding.field}`).join(", ");
  return `# TaskChord GitHub write preview (read-only)\n\nRepository: ${input.repository.nameWithOwner}\nAction: ${action}\nTitle: ${input.title}\nBody: ${Buffer.byteLength(input.body, "utf8")} UTF-8 bytes\nIntent Scaffold: ${missing}\n\n--- body begins ---\n${input.body}--- body ends ---\n`;
}
