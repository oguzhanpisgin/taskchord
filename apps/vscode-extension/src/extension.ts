import type { DoctorReport } from "@taskchord/contracts";
import { deniedProcessProbe, runDoctor } from "@taskchord/doctor";
import * as vscode from "vscode";
import { SetupTreeDataProvider } from "./setupTree.js";

const emptyTreeDataProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
  getTreeItem: (item) => item,
  getChildren: () => [],
};

export function activate(context: vscode.ExtensionContext): void {
  const setupProvider = new SetupTreeDataProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("taskchord.setup", setupProvider),
    vscode.window.registerTreeDataProvider("taskchord.work", emptyTreeDataProvider),
    vscode.window.registerTreeDataProvider("taskchord.proof", emptyTreeDataProvider),
    vscode.commands.registerCommand("taskchord.runDoctor", async (): Promise<DoctorReport> => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const report = await runDoctor({
        ...(vscode.workspace.isTrusted ? {} : { probe: deniedProcessProbe }),
        ...(vscode.workspace.isTrusted && workspaceRoot !== undefined ? { workspaceRoot } : {}),
      });
      setupProvider.update(report);
      return report;
    }),
  );
}

export function deactivate(): void {
  // No background process is started by Slice 001.
}
