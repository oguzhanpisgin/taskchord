import * as vscode from "vscode";
import { PreviewDocumentProvider } from "./previewProvider.js";
import { ProofController } from "./proofController.js";
import { RepositorySelectionStore } from "./repositorySelection.js";
import { SetupController } from "./setupController.js";
import { SetupTreeDataProvider } from "./setupTree.js";
import { WorkController } from "./workController.js";

export function activate(context: vscode.ExtensionContext): void {
  const setupProvider = new SetupTreeDataProvider();
  const setupController = new SetupController(setupProvider);
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
    ...setupController.registerCommands(),
    ...workController.registerCommands(),
    ...proofController.registerCommands(),
  );
}

export function deactivate(): void {
  // No background process is started by Slice 001.
}
