import { nodeProcessProbe, type ProcessProbe } from "@taskchord/doctor";
import { createGitHubClient, type GitHubClient, type GitHubPullRequest } from "@taskchord/github";
import {
  collectGitProof,
  compareCommitRelation,
  createPassiveProofReport,
  createUnavailableProofReport,
  type PullRequestInput,
  readGitIdentity,
  readLocalDefaultBranch,
  renderProofMarkdown,
} from "@taskchord/proof";
import * as vscode from "vscode";
import type { PreviewDocumentProvider } from "./previewProvider.js";
import { ProofTreeDataProvider } from "./proofTree.js";
import type { RepositorySelectionStore } from "./repositorySelection.js";

function toPullRequestInput(
  pullRequest: GitHubPullRequest | null,
  relation: Awaited<ReturnType<typeof compareCommitRelation>>,
): PullRequestInput {
  if (pullRequest === null)
    return { kind: "missing", summary: "No matching pull request was found." };
  return {
    kind: "available",
    relation,
    pullRequest: {
      number: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      state: pullRequest.state,
      isDraft: pullRequest.isDraft,
      headSha: pullRequest.headRefOid,
      baseBranch: pullRequest.baseRefName,
      reviewDecision: pullRequest.reviewDecision,
      checks: pullRequest.checks,
    },
  };
}

export class ProofController implements vscode.Disposable {
  readonly provider = new ProofTreeDataProvider();
  readonly #github: GitHubClient;
  readonly #probe: ProcessProbe;
  readonly #previews: PreviewDocumentProvider;
  readonly #repositories: RepositorySelectionStore;

  constructor(
    github: GitHubClient,
    probe: ProcessProbe,
    previews: PreviewDocumentProvider,
    repositories: RepositorySelectionStore,
  ) {
    this.#github = github;
    this.#probe = probe;
    this.#previews = previews;
    this.#repositories = repositories;
    if (!vscode.workspace.isTrusted) {
      this.provider.update({ kind: "untrusted" });
      void vscode.commands.executeCommand("setContext", "taskchord.proofState", "untrusted");
    } else {
      void vscode.commands.executeCommand("setContext", "taskchord.proofState", "idle");
    }
  }

  static create(
    previews: PreviewDocumentProvider,
    repositories: RepositorySelectionStore,
  ): ProofController {
    return new ProofController(
      createGitHubClient(nodeProcessProbe),
      nodeProcessProbe,
      previews,
      repositories,
    );
  }

  registerCommands(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand("taskchord.proof.refresh", () => this.refresh()),
      vscode.commands.registerCommand("taskchord.proof.selectRepository", () =>
        this.selectRepository(),
      ),
      vscode.commands.registerCommand("taskchord.proof.openDetails", () => this.openDetails()),
    ];
  }

  async selectRepository(): Promise<void> {
    if (!this.#ensureTrusted()) return;
    if (await this.#repositories.select()) await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.#ensureTrusted()) return;
    this.provider.update({ kind: "loading" });
    await vscode.commands.executeCommand("setContext", "taskchord.proofState", "loading");
    const selected = await this.#repositories.resolve(this.#github);
    if (!selected.ok) {
      if (selected.kind === "selection-required") {
        this.provider.update({ kind: "select-repository" });
        await vscode.commands.executeCommand(
          "setContext",
          "taskchord.proofState",
          "selectRepository",
        );
      } else {
        this.provider.update({
          kind: "error",
          message: selected.message,
          nextAction: selected.nextAction,
        });
        await vscode.commands.executeCommand("setContext", "taskchord.proofState", "error");
      }
      return;
    }
    const repository = selected.repository;
    const identity = await readGitIdentity(this.#probe, repository.workspacePath);
    if (identity === undefined) {
      this.provider.update({
        kind: "error",
        message: "Git identity could not be verified.",
        nextAction: "Open a valid Git branch, then retry.",
      });
      await vscode.commands.executeCommand("setContext", "taskchord.proofState", "error");
      return;
    }

    const pullRequestResult = identity.detached
      ? ({ ok: true, value: null } as const)
      : await this.#github.findPullRequest(repository, identity.branch);
    const pullRequest = pullRequestResult.ok ? pullRequestResult.value : null;
    const defaultBranchResult = await this.#github.getDefaultBranch(repository);
    const localDefault = defaultBranchResult.ok
      ? undefined
      : await readLocalDefaultBranch(this.#probe, repository.workspacePath);
    const baseBranch =
      pullRequest?.baseRefName ??
      (defaultBranchResult.ok ? defaultBranchResult.value : localDefault);
    if (baseBranch === undefined) {
      const report = createUnavailableProofReport(
        {
          workspaceFolderUri: repository.workspaceFolderUri,
          repository: repository.nameWithOwner,
          branch: identity.branch,
          headSha: identity.headSha,
          detached: identity.detached,
        },
        "The base branch could not be verified.",
      );
      this.#ready(report);
      return;
    }

    const git = await collectGitProof(this.#probe, {
      workspaceFolderUri: repository.workspaceFolderUri,
      workspacePath: repository.workspacePath,
      repository: repository.nameWithOwner,
      baseBranch,
    });
    if (!git.ok) {
      this.#ready(
        createUnavailableProofReport(
          {
            workspaceFolderUri: repository.workspaceFolderUri,
            repository: repository.nameWithOwner,
            branch: identity.branch,
            headSha: identity.headSha,
            baseBranch,
            detached: identity.detached,
          },
          git.summary,
          git.observedAt,
        ),
      );
      return;
    }

    let pullRequestInput: PullRequestInput;
    if (!pullRequestResult.ok) {
      pullRequestInput = { kind: "unverified", summary: pullRequestResult.failure.detail };
    } else {
      const relation =
        pullRequest === null
          ? "unknown"
          : await compareCommitRelation(
              this.#probe,
              repository.workspacePath,
              identity.headSha,
              pullRequest.headRefOid,
            );
      pullRequestInput = toPullRequestInput(pullRequest, relation);
    }
    this.#ready(createPassiveProofReport(git.evidence, pullRequestInput));
  }

  async openDetails(): Promise<vscode.Uri | undefined> {
    if (!this.#ensureTrusted()) return undefined;
    if (this.provider.state.kind !== "ready") {
      void vscode.window.showInformationMessage("Refresh TaskChord Proof first.");
      return undefined;
    }
    const uri = this.#previews.set(
      "proof-current",
      renderProofMarkdown(this.provider.state.report),
    );
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: true,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
    return uri;
  }

  dispose(): void {
    // Slice 004 Part 1 starts no background process.
  }

  #ready(report: ReturnType<typeof createPassiveProofReport>): void {
    this.provider.update({ kind: "ready", report });
    void vscode.commands.executeCommand("setContext", "taskchord.proofState", "ready");
  }

  #ensureTrusted(): boolean {
    if (vscode.workspace.isTrusted) return true;
    this.provider.update({ kind: "untrusted" });
    void vscode.commands.executeCommand("setContext", "taskchord.proofState", "untrusted");
    void vscode.window.showWarningMessage("Trust this workspace to collect TaskChord Proof.");
    return false;
  }
}
