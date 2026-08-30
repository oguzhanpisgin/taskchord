import type { ActiveGoal, RepositoryRef, WorkItem } from "@taskchord/contracts";
import type { OptionalRunnerReport } from "@taskchord/runners";

export type WorkState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "untrusted" }
  | { kind: "select-repository" }
  | { kind: "error"; message: string; nextAction: string }
  | {
      kind: "ready";
      repository: RepositoryRef;
      items: WorkItem[];
      truncated: boolean;
      activeGoal?: ActiveGoal;
      runners?: OptionalRunnerReport;
    };

export type WorkTreeModel =
  | { kind: "message"; label: string; description?: string; icon: string }
  | { kind: "runner"; label: string; description: string; icon: string; tooltip: string }
  | { kind: "issue"; item: WorkItem; label: string; description: string; icon: string }
  | { kind: "truncated"; label: string; description: string; icon: string };

function count(report: OptionalRunnerReport, name: "running" | "blocked" | "retrying"): string {
  const value = report.symphony.counts[name];
  return value === undefined ? "unknown" : String(value);
}

function runnerModel(
  report: OptionalRunnerReport | undefined,
  repository: RepositoryRef,
): WorkTreeModel {
  if (report === undefined) {
    return {
      kind: "runner",
      label: "Optional runner status · not refreshed",
      description: "Refresh Runner Status · Native handoff remains available",
      icon: "circle-outline",
      tooltip:
        "Runner status has not been refreshed. Native Codex handoff remains available without Symphony or Codex App Server.",
    };
  }

  const { symphony } = report;
  const availability = symphony.availability.toUpperCase();
  const freshness = symphony.freshness.toUpperCase();
  const fallback = "Native handoff remains available";
  const stateSummary = `Instance-wide: running ${count(report, "running")} · blocked ${count(report, "blocked")} · retrying ${count(report, "retrying")}`;
  const associationMatches =
    symphony.associationRepository?.toLowerCase() === repository.nameWithOwner.toLowerCase();
  const associationSummary = associationMatches
    ? `Repository association: current ${symphony.associations.current} · other ${symphony.associations.other} · unknown ${symphony.associations.unknown}`
    : "Repository association: unverified — refresh Runner Status for this repository";
  return {
    kind: "runner",
    label: ["Symphony", availability, freshness].filter(Boolean).join(" · "),
    description:
      symphony.availability === "ready"
        ? `${stateSummary} · ${associationSummary}`
        : `${symphony.reason ?? "Runner status could not be verified."} · ${stateSummary} · ${associationSummary} · ${fallback}`,
    icon: symphony.availability === "ready" ? "server" : "warning",
    tooltip: [
      `Symphony: ${symphony.availability}`,
      `Freshness: ${symphony.freshness}`,
      `Instance-wide running: ${count(report, "running")}`,
      `Instance-wide blocked: ${count(report, "blocked")}`,
      `Instance-wide retrying: ${count(report, "retrying")}`,
      associationSummary,
      ...(associationMatches && symphony.associations.truncated
        ? ["Association list was truncated."]
        : []),
      ...(symphony.reason === undefined ? [] : [`Message: ${symphony.reason}`]),
      fallback,
    ].join("\n"),
  };
}

export function toWorkTreeModels(state: WorkState): WorkTreeModel[] {
  switch (state.kind) {
    case "idle":
      return [];
    case "loading":
      return [{ kind: "message", label: "Loading open Issues…", icon: "loading~spin" }];
    case "untrusted":
      return [
        {
          kind: "message",
          label: "Trust this workspace to use GitHub Work.",
          icon: "shield",
        },
      ];
    case "select-repository":
      return [
        {
          kind: "message",
          label: "Select a repository for this workspace.",
          icon: "repo",
        },
      ];
    case "error":
      return [
        {
          kind: "message",
          label: state.message,
          description: state.nextAction,
          icon: "error",
        },
      ];
    case "ready": {
      const issues: WorkTreeModel[] = [
        runnerModel(state.runners, state.repository),
        ...state.items.map((item): WorkTreeModel => {
          const description =
            item.parsedBody.kind === "contract"
              ? "Contract"
              : item.parsedBody.kind === "contract-newer"
                ? `Contract v${item.parsedBody.version} · read-only`
                : "Unstructured";
          return {
            kind: "issue",
            item,
            label: `#${item.issue.number} ${item.issue.title}`,
            description,
            icon: item.parsedBody.kind === "contract" ? "checklist" : "issues",
          };
        }),
      ];
      if (state.activeGoal !== undefined) {
        issues.splice(1, 0, {
          kind: "message",
          label: `Active Goal · #${state.activeGoal.issueNumber} ${state.activeGoal.issueTitle}`,
          description: state.activeGoal.goal,
          icon: "target",
        });
      }
      if (state.items.length === 0) {
        issues.push({ kind: "message", label: "No open Issues.", icon: "issues" });
      }
      if (state.truncated) {
        issues.push({
          kind: "truncated",
          label: "Showing the first 100 open Issues.",
          description: "The list is truncated.",
          icon: "warning",
        });
      }
      return issues;
    }
  }
}
