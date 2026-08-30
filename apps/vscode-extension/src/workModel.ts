import type { ActiveGoal, RepositoryRef, WorkItem } from "@taskchord/contracts";

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
    };

export type WorkTreeModel =
  | { kind: "message"; label: string; description?: string; icon: string }
  | { kind: "issue"; item: WorkItem; label: string; description: string; icon: string }
  | { kind: "truncated"; label: string; description: string; icon: string };

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
      const issues: WorkTreeModel[] = state.items.map((item) => {
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
      });
      if (state.activeGoal !== undefined) {
        issues.unshift({
          kind: "message",
          label: `Active Goal · #${state.activeGoal.issueNumber} ${state.activeGoal.issueTitle}`,
          description: state.activeGoal.goal,
          icon: "target",
        });
      }
      if (issues.length === 0) {
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
