import type { DoctorReport } from "@taskchord/contracts";
import { deniedProcessProbe, runDoctor } from "@taskchord/doctor";
import * as vscode from "vscode";
import { PreviewDocumentProvider } from "./previewProvider.js";
import { ProofController } from "./proofController.js";
import { RepositorySelectionStore } from "./repositorySelection.js";
import { SetupTreeDataProvider } from "./setupTree.js";
import { WorkController } from "./workController.js";

export function activate(context: vscode.ExtensionContext): void {
  const setupProvider = new SetupTreeDataProvider();
  const previews = new PreviewDocumentProvider();
  const repositories = new RepositorySelectionStore(context);
  const workController = new WorkController(context, undefined, previews, repositories);
  const proofController = ProofController.create(context, previews, repositories);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("taskchord-preview", previews),
    vscode.window.registerTreeDataProvider("taskchord.setup", setupProvider),
    vscode.window.registerTreeDataProvider("taskchord.work", workController.provider),
    vscode.window.registerTreeDataProvider("taskchord.proof", proofController.provider),
    workController,
    proofController,
    ...workController.registerCommands(),
    ...proofController.registerCommands(),
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
