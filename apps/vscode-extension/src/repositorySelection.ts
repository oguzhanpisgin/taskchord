import type { RepositoryRef } from "@taskchord/contracts";
import type { GitHubClient } from "@taskchord/github";
import * as vscode from "vscode";

const SELECTED_REPOSITORY_KEY = "taskchord.selectedRepositoryFolder.v1";

export type RepositorySelectionResult =
  | { ok: true; repository: RepositoryRef }
  | {
      ok: false;
      kind: "no-workspace" | "selection-required" | "github";
      message: string;
      nextAction: string;
    };

export class RepositorySelectionStore {
  #currentRepository: RepositoryRef | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get currentRepository(): RepositoryRef | undefined {
    return this.#currentRepository;
  }

  async select(): Promise<boolean> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const selected = await vscode.window.showQuickPick(
      folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
      { title: "Select the GitHub repository TaskChord should use" },
    );
    if (selected === undefined) return false;
    this.#currentRepository = undefined;
    await this.context.workspaceState.update(
      SELECTED_REPOSITORY_KEY,
      selected.folder.uri.toString(),
    );
    return true;
  }

  async resolve(github: GitHubClient): Promise<RepositorySelectionResult> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      return {
        ok: false,
        kind: "no-workspace",
        message: "No workspace folder is open.",
        nextAction: "Open a Git repository, then retry.",
      };
    }
    const stored = this.context.workspaceState.get<string>(SELECTED_REPOSITORY_KEY);
    const folder =
      folders.length === 1
        ? folders[0]
        : folders.find((candidate) => candidate.uri.toString() === stored);
    if (folder === undefined) {
      return {
        ok: false,
        kind: "selection-required",
        message: "Select a repository for this workspace.",
        nextAction: "Run Select Repository.",
      };
    }
    const result = await github.resolveRepository(folder.uri.toString(), folder.uri.fsPath);
    if (result.ok) {
      this.#currentRepository = result.value;
      return { ok: true, repository: result.value };
    }
    return {
      ok: false,
      kind: "github",
      message: result.failure.detail,
      nextAction: result.failure.nextAction,
    };
  }
}
