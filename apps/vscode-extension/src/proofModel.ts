import type { ProofReport, ProofStrip } from "@taskchord/proof";

export type ProofState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "running"; report: ProofReport; verification: "build" | "tests" }
  | { kind: "untrusted" }
  | { kind: "select-repository" }
  | { kind: "error"; message: string; nextAction: string }
  | { kind: "ready"; report: ProofReport };

export type ProofTreeModel =
  | { kind: "message"; label: string; description?: string; icon: string }
  | { kind: "summary"; label: string; description: string; icon: string }
  | { kind: "strip"; evidence: ProofStrip; label: string; description: string; icon: string };

const STATUS_ICONS: Record<ProofStrip["status"], string> = {
  passed: "pass-filled",
  failed: "error",
  missing: "circle-slash",
  pending: "clock",
  running: "loading~spin",
  stale: "history",
  unverified: "question",
};

export function toProofTreeModels(state: ProofState): ProofTreeModel[] {
  switch (state.kind) {
    case "idle":
      return [];
    case "loading":
      return [{ kind: "message", label: "Collecting read-only proof…", icon: "loading~spin" }];
    case "running": {
      const models = toProofTreeModels({ kind: "ready", report: state.report });
      const label = state.verification === "build" ? "Build" : "Tests";
      return [
        { kind: "message", label: `Running ${label} verification…`, icon: "loading~spin" },
        ...models,
      ];
    }
    case "untrusted":
      return [{ kind: "message", label: "Trust this workspace to collect Proof.", icon: "shield" }];
    case "select-repository":
      return [{ kind: "message", label: "Select a repository for this workspace.", icon: "repo" }];
    case "error":
      return [
        { kind: "message", label: state.message, description: state.nextAction, icon: "error" },
      ];
    case "ready": {
      const { report } = state;
      const models: ProofTreeModel[] = [
        {
          kind: "summary",
          label:
            report.humanDecision.decision === "accepted"
              ? report.unresolvedTechnicalStrips.length === 0
                ? "Accepted"
                : "Accepted — unresolved proof exists"
              : report.humanDecision.decision === "changes-requested"
                ? "Changes requested"
                : report.humanDecision.decision === "stale"
                  ? "Human decision is stale"
                  : report.technicalReadiness === "ready-for-human-review"
                    ? "Ready for human review"
                    : "Not ready for human review",
          description: `Human: ${report.humanDecision.decision}`,
          icon:
            report.technicalReadiness === "ready-for-human-review" ? "verified-filled" : "warning",
        },
      ];
      for (const id of [
        "changed-files",
        "build",
        "tests",
        "commit",
        "pr-ci",
        "human-decision",
      ] as const) {
        const evidence = report.strips[id];
        models.push({
          kind: "strip",
          evidence,
          label: evidence.label,
          description: `${evidence.status} · ${evidence.summary}`,
          icon: STATUS_ICONS[evidence.status],
        });
      }
      return models;
    }
  }
}
