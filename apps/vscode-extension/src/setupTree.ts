import type { CheckStatus, DoctorReport } from "@taskchord/contracts";
import type { OptionalRunnerReport } from "@taskchord/runners";
import * as vscode from "vscode";
import { toSetupItems } from "./setupModel.js";

function statusIcon(status: CheckStatus): vscode.ThemeIcon {
  if (status === "ready") {
    return new vscode.ThemeIcon("pass", new vscode.ThemeColor("testing.iconPassed"));
  }

  if (status === "failed") {
    return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
  }

  return new vscode.ThemeIcon(
    "warning",
    new vscode.ThemeColor("notificationsWarningIcon.foreground"),
  );
}

export class SetupTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  readonly #onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.#onDidChangeTreeData.event;
  #report: DoctorReport | undefined;
  #runners: OptionalRunnerReport | undefined;

  constructor(report?: DoctorReport) {
    this.#report = report;
  }

  update(report: DoctorReport): void {
    this.#report = report;
    this.#onDidChangeTreeData.fire();
  }

  updateRunners(report: OptionalRunnerReport): void {
    this.#runners = report;
    this.#onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    return toSetupItems(this.#report, this.#runners).map((model) => {
      const item = new vscode.TreeItem(model.label, vscode.TreeItemCollapsibleState.None);
      item.description = model.description;
      item.iconPath = statusIcon(model.status);
      item.contextValue = "taskchord.doctorCheck";
      item.tooltip = model.tooltip;
      return item;
    });
  }
}
