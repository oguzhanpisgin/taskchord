import * as vscode from "vscode";
import { toWorkTreeModels, type WorkState, type WorkTreeModel } from "./workModel.js";

export class WorkTreeDataProvider implements vscode.TreeDataProvider<WorkTreeModel> {
  readonly #onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.#onDidChangeTreeData.event;
  #state: WorkState = { kind: "idle" };

  update(state: WorkState): void {
    this.#state = state;
    this.#onDidChangeTreeData.fire();
  }

  get state(): WorkState {
    return this.#state;
  }

  getTreeItem(model: WorkTreeModel): vscode.TreeItem {
    const item = new vscode.TreeItem(model.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(model.icon);
    if (model.description !== undefined) {
      item.description = model.description;
    }
    if (model.kind === "issue") {
      item.tooltip = `${model.item.repository.nameWithOwner} · #${model.item.issue.number}\n${model.item.issue.title}`;
      item.contextValue =
        model.item.parsedBody.kind === "contract"
          ? "taskchord.contractIssue"
          : "taskchord.readOnlyIssue";
      item.command = {
        command: "taskchord.work.openOnGitHub",
        title: "Open on GitHub",
        arguments: [model],
      };
    }
    if (model.kind === "runner") {
      item.tooltip = model.tooltip;
      item.contextValue = "taskchord.runnerStatus";
      item.command = {
        command: "taskchord.runners.refresh",
        title: "Refresh Runner Status",
      };
    }
    return item;
  }

  getChildren(): WorkTreeModel[] {
    return toWorkTreeModels(this.#state);
  }
}
