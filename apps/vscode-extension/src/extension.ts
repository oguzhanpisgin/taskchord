import { nodeProcessProbe } from "@taskchord/doctor";
import { createGitHubClient } from "@taskchord/github";
import * as vscode from "vscode";
import { PreviewDocumentProvider } from "./previewProvider.js";
import { ProofController } from "./proofController.js";
import { RepositorySelectionStore } from "./repositorySelection.js";
import { RunnerStateStore } from "./runnerState.js";
import { SetupController } from "./setupController.js";
import { SetupTreeDataProvider } from "./setupTree.js";
import { WorkController } from "./workController.js";

export function activate(context: vscode.ExtensionContext): void {
  const setupProvider = new SetupTreeDataProvider();
  const previews = new PreviewDocumentProvider();
  const repositories = new RepositorySelectionStore(context);
  const github = createGitHubClient(nodeProcessProbe);
  const runners = new RunnerStateStore();
  const setupController = new SetupController(
    setupProvider,
    runners,
    async () => repositories.currentRepository?.nameWithOwner,
  );
  const workController = new WorkController(context, github, previews, repositories, runners);
  const proofController = ProofController.create(context, previews, repositories);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider("taskchord-preview", previews),
    vscode.window.registerTreeDataProvider("taskchord.setup", setupProvider),
    vscode.window.registerTreeDataProvider("taskchord.work", workController.provider),
    vscode.window.registerTreeDataProvider("taskchord.proof", proofController.provider),
    workController,
    proofController,
    runners,
    runners.onDidChange((report) => setupProvider.updateRunners(report)),
    ...setupController.registerCommands(),
    ...workController.registerCommands(),
    ...proofController.registerCommands(),
  );
}

export function deactivate(): void {
  // No background process is started by Slice 001.
}
