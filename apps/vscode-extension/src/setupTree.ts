import type { DoctorReport } from "@taskchord/contracts";
import * as vscode from "vscode";

function displayName(kind: DoctorReport["environment"]["kind"]): string {
  const names: Record<DoctorReport["environment"]["kind"], string> = {
    windows: "Windows",
    wsl: "WSL",
    macos: "macOS",
    linux: "Linux",
    unknown: "Unknown",
  };

  return names[kind];
}

function statusIcon(status: DoctorReport["summary"]["status"]): vscode.ThemeIcon {
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
  #report: DoctorReport;

  constructor(report: DoctorReport) {
    this.#report = report;
  }

  update(report: DoctorReport): void {
    this.#report = report;
    this.#onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const environment = this.#report.environment;
    const item = new vscode.TreeItem(
      `Environment: ${displayName(environment.kind)}`,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = environment.architecture;
    item.iconPath = statusIcon(this.#report.summary.status);
    item.contextValue = "taskchord.environment";
    item.tooltip = new vscode.MarkdownString(
      [
        `**Status:** ${this.#report.summary.status}`,
        `**Platform:** ${environment.platform}`,
        `**Architecture:** ${environment.architecture}`,
        `**Release:** ${environment.release}`,
      ].join("  \n"),
    );

    return [item];
  }
}
