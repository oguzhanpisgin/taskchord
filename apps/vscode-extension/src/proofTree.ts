import * as vscode from "vscode";
import { type ProofState, type ProofTreeModel, toProofTreeModels } from "./proofModel.js";

export class ProofTreeDataProvider implements vscode.TreeDataProvider<ProofTreeModel> {
  readonly #onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.#onDidChangeTreeData.event;
  #state: ProofState = { kind: "idle" };

  get state(): ProofState {
    return this.#state;
  }

  update(state: ProofState): void {
    this.#state = state;
    this.#onDidChangeTreeData.fire();
  }

  getTreeItem(model: ProofTreeModel): vscode.TreeItem {
    const item = new vscode.TreeItem(model.label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(model.icon);
    if (model.description !== undefined) item.description = model.description;
    if (model.kind === "strip") {
      item.tooltip = `${model.evidence.label}\n${model.evidence.summary}\nObserved: ${model.evidence.observedAt}`;
      item.contextValue = "taskchord.proofStrip";
      item.command =
        model.evidence.id === "build"
          ? { command: "taskchord.proof.runBuild", title: "Run Proof Build" }
          : model.evidence.id === "tests"
            ? { command: "taskchord.proof.runTests", title: "Run Proof Tests" }
            : {
                command: "taskchord.proof.openDetails",
                title: "Open Proof Details",
              };
    }
    return item;
  }

  getChildren(): ProofTreeModel[] {
    return toProofTreeModels(this.#state);
  }
}
