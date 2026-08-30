import type { DoctorReport } from "@taskchord/contracts";
import { runDoctor } from "@taskchord/doctor";
import * as vscode from "vscode";
import { SetupTreeDataProvider } from "./setupTree.js";

const emptyTreeDataProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
  getTreeItem: (item) => item,
  getChildren: () => [],
};

export function activate(context: vscode.ExtensionContext): void {
  const setupProvider = new SetupTreeDataProvider(runDoctor());

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("taskchord.setup", setupProvider),
    vscode.window.registerTreeDataProvider("taskchord.work", emptyTreeDataProvider),
    vscode.window.registerTreeDataProvider("taskchord.proof", emptyTreeDataProvider),
    vscode.commands.registerCommand("taskchord.runDoctor", (): DoctorReport => {
      const report = runDoctor();
      setupProvider.update(report);
      return report;
    }),
  );
}

export function deactivate(): void {
  // No background process is started by Slice 001.
}
