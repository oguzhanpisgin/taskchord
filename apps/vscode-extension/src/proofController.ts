import type { RepositoryRef } from "@taskchord/contracts";
import { nodeProcessProbe, type ProcessProbe } from "@taskchord/doctor";
import { createGitHubClient, type GitHubClient, type GitHubPullRequest } from "@taskchord/github";
import {
  applyProofEvidence,
  collectGitProof,
  compareCommitRelation,
  createHumanDecision,
  createPassiveProofReport,
  createUnavailableProofReport,
  discoverVerificationScripts,
  type ProofReport,
  type PullRequestInput,
  readGitIdentity,
  readLocalDefaultBranch,
  renderProofMarkdown,
  renderVerificationPreview,
  type VerificationKind,
  type VerificationRunRecord,
  type VerificationScript,
} from "@taskchord/proof";
import * as vscode from "vscode";
import type { PreviewDocumentProvider } from "./previewProvider.js";
import { ProofEvidenceStore } from "./proofEvidenceStore.js";
import { type ProofTaskRunner, VscodeProofTaskRunner } from "./proofTaskRunner.js";
import { ProofTreeDataProvider } from "./proofTree.js";
import type { RepositorySelectionStore } from "./repositorySelection.js";

const LOCKFILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
] as const;

interface ScriptInventory {
  scripts: readonly VerificationScript[];
  packageJsonPath: string;
  reason?: string;
}

interface CollectedProof {
  report: ProofReport;
  repository: RepositoryRef;
  folder: vscode.WorkspaceFolder;
  inventory: ScriptInventory;
}

type CollectionResult =
  | { ok: true; value: CollectedProof }
  | {
      ok: false;
      kind: "selection-required" | "error";
      message: string;
      nextAction: string;
    };

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

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The verification task could not be completed.";
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readScriptInventory(folder: vscode.WorkspaceFolder): Promise<ScriptInventory> {
  const packageJson = vscode.Uri.joinPath(folder.uri, "package.json");
  try {
    const bytes = await vscode.workspace.fs.readFile(packageJson);
    const presentLockfiles: string[] = [];
    for (const lockfile of LOCKFILES) {
      if (await fileExists(vscode.Uri.joinPath(folder.uri, lockfile)))
        presentLockfiles.push(lockfile);
    }
    const discovery = discoverVerificationScripts(
      new TextDecoder().decode(bytes),
      presentLockfiles,
    );
    return discovery.ok
      ? { scripts: discovery.scripts, packageJsonPath: packageJson.fsPath }
      : { scripts: [], packageJsonPath: packageJson.fsPath, reason: discovery.reason };
  } catch {
    return {
      scripts: [],
      packageJsonPath: packageJson.fsPath,
      reason: "The selected workspace root does not contain a readable package.json.",
    };
  }
}

export class ProofController implements vscode.Disposable {
  readonly provider = new ProofTreeDataProvider();
  readonly #github: GitHubClient;
  readonly #probe: ProcessProbe;
  readonly #previews: PreviewDocumentProvider;
  readonly #repositories: RepositorySelectionStore;
  readonly #evidence: ProofEvidenceStore;
  readonly #tasks: ProofTaskRunner;

  constructor(
    context: vscode.ExtensionContext,
    github: GitHubClient,
    probe: ProcessProbe,
    previews: PreviewDocumentProvider,
    repositories: RepositorySelectionStore,
    tasks: ProofTaskRunner = new VscodeProofTaskRunner(),
  ) {
    this.#github = github;
    this.#probe = probe;
    this.#previews = previews;
    this.#repositories = repositories;
    this.#evidence = new ProofEvidenceStore(context);
    this.#tasks = tasks;
    if (!vscode.workspace.isTrusted) {
      this.provider.update({ kind: "untrusted" });
      void vscode.commands.executeCommand("setContext", "taskchord.proofState", "untrusted");
    } else {
      void vscode.commands.executeCommand("setContext", "taskchord.proofState", "idle");
    }
  }

  static create(
    context: vscode.ExtensionContext,
    previews: PreviewDocumentProvider,
    repositories: RepositorySelectionStore,
  ): ProofController {
    return new ProofController(
      context,
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
      vscode.commands.registerCommand("taskchord.proof.runBuild", () =>
        this.runVerification("build"),
      ),
      vscode.commands.registerCommand("taskchord.proof.runTests", () =>
        this.runVerification("tests"),
      ),
      vscode.commands.registerCommand("taskchord.proof.accept", () =>
        this.recordHumanDecision("accepted"),
      ),
      vscode.commands.registerCommand("taskchord.proof.requestChanges", () =>
        this.recordHumanDecision("changes-requested"),
      ),
      vscode.commands.registerCommand("taskchord.proof.clearDecision", () =>
        this.clearHumanDecision(),
      ),
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
    const collected = await this.#collect();
    if (!collected.ok) {
      if (collected.kind === "selection-required") {
        this.provider.update({ kind: "select-repository" });
        await vscode.commands.executeCommand(
          "setContext",
          "taskchord.proofState",
          "selectRepository",
        );
      } else {
        this.provider.update({
          kind: "error",
          message: collected.message,
          nextAction: collected.nextAction,
        });
        await vscode.commands.executeCommand("setContext", "taskchord.proofState", "error");
      }
      return;
    }
    this.#ready(collected.value.report);
  }

  async openDetails(): Promise<vscode.Uri | undefined> {
    if (!this.#ensureTrusted()) return undefined;
    if (this.provider.state.kind !== "ready") {
      void vscode.window.showInformationMessage("Refresh TaskChord Proof first.");
      return undefined;
    }
    return await this.#openPreview(
      "proof-current",
      renderProofMarkdown(this.provider.state.report),
    );
  }

  async runVerification(kind: VerificationKind): Promise<void> {
    if (!this.#ensureTrusted()) return;
    const initial = await this.#collect();
    if (!initial.ok) {
      void vscode.window.showWarningMessage(initial.message);
      return;
    }
    if (initial.value.report.subject.detached) {
      void vscode.window.showWarningMessage(
        "Verification runs are disabled in detached HEAD state.",
      );
      return;
    }
    const candidates = initial.value.inventory.scripts.filter((script) => script.kind === kind);
    if (candidates.length === 0) {
      void vscode.window.showWarningMessage(
        initial.value.inventory.reason ??
          `No ${kind === "build" ? "build/build:*" : "test/test:*"} package script was found.`,
      );
      return;
    }
    const picked = await vscode.window.showQuickPick(
      candidates.map((script) => ({ label: script.name, description: script.body, script })),
      { title: `Select the ${kind === "build" ? "build" : "test"} script TaskChord should run` },
    );
    if (picked === undefined) return;
    await this.#openPreview(
      `proof-${kind}-preview`,
      renderVerificationPreview({
        packageJsonPath: initial.value.inventory.packageJsonPath,
        cwd: initial.value.repository.workspacePath,
        script: picked.script,
      }),
    );
    const approval = await vscode.window.showWarningMessage(
      `Run exactly the previewed ${picked.script.name} package script in ${initial.value.repository.nameWithOwner}?`,
      { modal: true },
      "Run Script",
    );
    if (approval !== "Run Script") return;

    const start = await this.#collect();
    if (!start.ok) {
      void vscode.window.showWarningMessage(start.message);
      return;
    }
    const currentScript = start.value.inventory.scripts.find(
      (script) => script.kind === kind && script.name === picked.script.name,
    );
    if (
      currentScript === undefined ||
      currentScript.definitionHash !== picked.script.definitionHash ||
      start.value.report.subject.workspaceFolderUri !==
        initial.value.report.subject.workspaceFolderUri ||
      start.value.report.subject.repository !== initial.value.report.subject.repository ||
      start.value.report.subject.branch !== initial.value.report.subject.branch
    ) {
      void vscode.window.showWarningMessage(
        "The repository or package script changed after preview. Preview the verification again.",
      );
      return;
    }

    this.provider.update({ kind: "running", report: start.value.report, verification: kind });
    await vscode.commands.executeCommand("setContext", "taskchord.proofState", "running");
    try {
      const taskResult = await this.#tasks.run(start.value.folder, currentScript);
      const end = await this.#collect();
      const run: VerificationRunRecord = {
        kind,
        scriptName: currentScript.name,
        definitionHash: currentScript.definitionHash,
        runnerCommand: currentScript.runnerCommand,
        startedAt: taskResult.startedAt,
        finishedAt: taskResult.finishedAt,
        exitCode: taskResult.exitCode,
        startFingerprint: start.value.report.fingerprint,
        endFingerprint: end.ok ? end.value.report.fingerprint : "unverified",
      };
      await this.#evidence.setRun(start.value.report.subject, run);
      await this.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(failureMessage(error));
      await this.refresh();
    }
  }

  async recordHumanDecision(decision: "accepted" | "changes-requested"): Promise<void> {
    if (!this.#ensureTrusted()) return;
    const collected = await this.#collect();
    if (!collected.ok) {
      void vscode.window.showWarningMessage(collected.message);
      return;
    }
    const { report } = collected.value;
    if (report.subject.detached) {
      void vscode.window.showWarningMessage("Human decisions are disabled in detached HEAD state.");
      return;
    }
    const unresolved =
      report.unresolvedTechnicalStrips.length === 0
        ? "none"
        : report.unresolvedTechnicalStrips.join(", ");
    const label = decision === "accepted" ? "Accept Proof" : "Request Changes";
    const approval = await vscode.window.showWarningMessage(
      [
        `${label} for ${report.subject.repository}?`,
        `Branch: ${report.subject.branch}`,
        `HEAD: ${report.subject.headSha}`,
        `Technical readiness: ${report.technicalReadiness}`,
        `Unresolved technical strips: ${unresolved}`,
        `Evidence fingerprint: ${report.technicalFingerprint}`,
      ].join("\n"),
      { modal: true },
      label,
    );
    if (approval !== label) return;
    await this.#evidence.setHumanDecision(
      report.subject,
      createHumanDecision(decision, report.technicalFingerprint),
    );
    await this.refresh();
  }

  async clearHumanDecision(): Promise<void> {
    if (!this.#ensureTrusted()) return;
    const collected = await this.#collect();
    if (!collected.ok) {
      void vscode.window.showWarningMessage(collected.message);
      return;
    }
    const approval = await vscode.window.showWarningMessage(
      `Clear the local human decision for ${collected.value.report.subject.repository} on ${collected.value.report.subject.branch}?`,
      { modal: true },
      "Clear Decision",
    );
    if (approval !== "Clear Decision") return;
    await this.#evidence.setHumanDecision(collected.value.report.subject, undefined);
    await this.refresh();
  }

  dispose(): void {
    // Task listeners are scoped to each explicitly approved verification run.
  }

  async #collect(): Promise<CollectionResult> {
    const selected = await this.#repositories.resolve(this.#github);
    if (!selected.ok) {
      return {
        ok: false,
        kind: selected.kind === "selection-required" ? "selection-required" : "error",
        message: selected.message,
        nextAction: selected.nextAction,
      };
    }
    const repository = selected.repository;
    const folder = (vscode.workspace.workspaceFolders ?? []).find(
      (candidate) => candidate.uri.toString() === repository.workspaceFolderUri,
    );
    if (folder === undefined) {
      return {
        ok: false,
        kind: "error",
        message: "The selected workspace folder is no longer open.",
        nextAction: "Select an open repository, then retry.",
      };
    }
    const inventory = await readScriptInventory(folder);
    const identity = await readGitIdentity(this.#probe, repository.workspacePath);
    if (identity === undefined) {
      return {
        ok: false,
        kind: "error",
        message: "Git identity could not be verified.",
        nextAction: "Open a valid Git branch, then retry.",
      };
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
    const subject = {
      workspaceFolderUri: repository.workspaceFolderUri,
      repository: repository.nameWithOwner,
      branch: identity.branch,
      headSha: identity.headSha,
      detached: identity.detached,
      ...(baseBranch === undefined ? {} : { baseBranch }),
    };
    let passive: ProofReport;
    if (baseBranch === undefined) {
      passive = createUnavailableProofReport(subject, "The base branch could not be verified.");
    } else {
      const git = await collectGitProof(this.#probe, {
        workspaceFolderUri: repository.workspaceFolderUri,
        workspacePath: repository.workspacePath,
        repository: repository.nameWithOwner,
        baseBranch,
      });
      if (!git.ok) {
        passive = createUnavailableProofReport(subject, git.summary, git.observedAt);
      } else {
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
        passive = createPassiveProofReport(git.evidence, pullRequestInput);
      }
    }
    const stored = this.#evidence.get(passive.subject);
    const report = applyProofEvidence(passive, {
      scripts: inventory.scripts,
      ...(stored.build === undefined ? {} : { build: stored.build }),
      ...(stored.tests === undefined ? {} : { tests: stored.tests }),
      ...(stored.humanDecision === undefined ? {} : { humanDecision: stored.humanDecision }),
    });
    return { ok: true, value: { report, repository, folder, inventory } };
  }

  async #openPreview(id: string, content: string): Promise<vscode.Uri> {
    const uri = this.#previews.set(id, content);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: true,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
    return uri;
  }

  #ready(report: ProofReport): void {
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
