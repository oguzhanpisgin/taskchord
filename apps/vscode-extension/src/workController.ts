import { randomUUID } from "node:crypto";
import type {
  ActiveGoal,
  RemoteIssue,
  RepositoryRef,
  ScaffoldFinding,
  WorkItem,
} from "@taskchord/contracts";
import { nodeProcessProbe } from "@taskchord/doctor";
import { confirmIssueWrite, createGitHubClient, type GitHubClient } from "@taskchord/github";
import {
  handoffFindings,
  newContractTemplate,
  parseContractDocument,
  parseIssueBody,
  renderCodexHandoff,
  renderContractDocument,
  renderIssueWritePreview,
  scaffoldFindings,
} from "@taskchord/work";
import * as vscode from "vscode";
import { type DraftMetadata, DraftStore } from "./draftStore.js";
import { PreviewDocumentProvider } from "./previewProvider.js";
import type { WorkTreeModel } from "./workModel.js";
import { WorkTreeDataProvider } from "./workTree.js";
import { canUseWork } from "./workTrust.js";

const SELECTED_REPOSITORY_KEY = "taskchord.selectedRepositoryFolder.v1";
const ACTIVE_GOAL_KEY = "taskchord.activeGoal.v1";

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

function fieldRange(document: vscode.TextDocument, field: ScaffoldFinding["field"]): vscode.Range {
  if (field === "title") {
    return document.lineAt(0).range;
  }
  const heading = `## ${field}`;
  for (let line = 0; line < document.lineCount; line += 1) {
    if (document.lineAt(line).text.trim().toLowerCase() === heading.toLowerCase()) {
      return document.lineAt(line).range;
    }
  }
  return document.lineAt(Math.max(0, document.lineCount - 1)).range;
}

function validateSnapshot(title: string, body: string): string | undefined {
  if (title.trim().length === 0) {
    return "Title cannot be empty.";
  }
  if (/\r|\n/u.test(title)) {
    return "Title must be a single line.";
  }
  if (title.length > 256) {
    return "Title cannot exceed 256 characters.";
  }
  if (Buffer.byteLength(body, "utf8") > 65_536) {
    return "Issue body cannot exceed 65,536 UTF-8 bytes.";
  }
  return undefined;
}

export class WorkController implements vscode.Disposable {
  readonly provider = new WorkTreeDataProvider();
  readonly #context: vscode.ExtensionContext;
  readonly #github: GitHubClient;
  readonly #drafts: DraftStore;
  readonly #previews = new PreviewDocumentProvider();
  readonly #diagnostics = vscode.languages.createDiagnosticCollection("taskchord-intent-scaffold");
  readonly #goalStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  readonly #disposables: vscode.Disposable[] = [];

  constructor(
    context: vscode.ExtensionContext,
    github: GitHubClient = createGitHubClient(nodeProcessProbe),
  ) {
    this.#context = context;
    this.#github = github;
    this.#drafts = new DraftStore(context);
    this.#goalStatus.name = "TaskChord Active Goal";
    this.#goalStatus.command = "taskchord.work.copyCodexHandoff";

    this.#disposables.push(
      vscode.workspace.registerTextDocumentContentProvider("taskchord-preview", this.#previews),
      this.#diagnostics,
      this.#goalStatus,
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.#updateDiagnostics(document)),
      vscode.workspace.onDidOpenTextDocument((document) => this.#updateDiagnostics(document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        void this.#setDraftContext(editor?.document);
      }),
    );
    this.#updateGoalProjection();
    void this.#setDraftContext(vscode.window.activeTextEditor?.document);
    if (vscode.workspace.isTrusted) {
      void vscode.commands.executeCommand("setContext", "taskchord.workState", "idle");
    } else {
      this.provider.update({ kind: "untrusted" });
      void vscode.commands.executeCommand("setContext", "taskchord.workState", "untrusted");
    }
  }

  registerCommands(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand("taskchord.work.refresh", () => this.refresh()),
      vscode.commands.registerCommand("taskchord.work.selectRepository", () =>
        this.selectRepository(),
      ),
      vscode.commands.registerCommand("taskchord.work.newContract", () => this.newContract()),
      vscode.commands.registerCommand(
        "taskchord.work.editContract",
        (model: WorkTreeModel | undefined) => this.editContract(model),
      ),
      vscode.commands.registerCommand("taskchord.work.previewAndSubmit", () =>
        this.previewAndSubmit(),
      ),
      vscode.commands.registerCommand(
        "taskchord.work.openOnGitHub",
        (model: WorkTreeModel | undefined) => this.openOnGitHub(model),
      ),
      vscode.commands.registerCommand(
        "taskchord.work.setActiveGoal",
        (model: WorkTreeModel | undefined) => this.setActiveGoal(model),
      ),
      vscode.commands.registerCommand("taskchord.work.clearActiveGoal", () =>
        this.clearActiveGoal(),
      ),
      vscode.commands.registerCommand(
        "taskchord.work.copyCodexHandoff",
        (model: WorkTreeModel | undefined) => this.copyCodexHandoff(model),
      ),
    ];
  }

  async refresh(): Promise<void> {
    if (!this.#ensureTrusted()) {
      return;
    }
    this.provider.update({ kind: "loading" });
    await vscode.commands.executeCommand("setContext", "taskchord.workState", "loading");
    const repository = await this.#repository();
    if (repository === undefined) {
      return;
    }
    const result = await this.#github.listOpenIssues(repository);
    if (!result.ok) {
      this.#showFailure(result.failure.detail, result.failure.nextAction);
      return;
    }
    const items: WorkItem[] = result.value.issues.map((issue) => ({
      repository,
      issue,
      parsedBody: parseIssueBody(issue.body),
    }));
    const activeGoal = this.#activeGoal();
    this.provider.update({
      kind: "ready",
      repository,
      items,
      truncated: result.value.truncated,
      ...(activeGoal?.repository === repository.nameWithOwner ? { activeGoal } : {}),
    });
    await vscode.commands.executeCommand(
      "setContext",
      "taskchord.workState",
      items.length === 0 ? "empty" : "ready",
    );
  }

  async selectRepository(): Promise<void> {
    if (!this.#ensureTrusted()) {
      return;
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    const selected = await vscode.window.showQuickPick(
      folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
      { title: "Select the GitHub repository TaskChord should use" },
    );
    if (selected === undefined) {
      return;
    }
    await this.#context.workspaceState.update(
      SELECTED_REPOSITORY_KEY,
      selected.folder.uri.toString(),
    );
    await this.refresh();
  }

  async newContract(): Promise<vscode.Uri | undefined> {
    if (!this.#ensureTrusted()) {
      return;
    }
    const repository = await this.#repository();
    if (repository === undefined) {
      return undefined;
    }
    const id = randomUUID();
    try {
      const draft = await this.#drafts.create(
        id,
        repository,
        renderContractDocument("", newContractTemplate(id)),
      );
      const document = await this.#drafts.open(draft);
      this.#updateDiagnostics(document);
      return document.uri;
    } catch (error) {
      void vscode.window.showErrorMessage(failureMessage(error));
      return undefined;
    }
  }

  async editContract(model: WorkTreeModel | undefined): Promise<void> {
    if (!this.#ensureTrusted()) {
      return;
    }
    if (model?.kind !== "issue") {
      void vscode.window.showInformationMessage("Select a TaskChord contract Issue in Work first.");
      return;
    }
    if (model.item.parsedBody.kind !== "contract") {
      void vscode.window.showInformationMessage(
        "Only TaskChord contract Issues can be edited in the IDE. This Issue remains read-only.",
      );
      return;
    }
    const result = await this.#github.viewIssue(model.item.repository, model.item.issue.number);
    if (!result.ok) {
      this.#showFailure(result.failure.detail, result.failure.nextAction);
      return;
    }
    const parsed = parseIssueBody(result.value.body);
    if (parsed.kind !== "contract") {
      void vscode.window.showWarningMessage(
        "The Issue changed and is no longer an editable TaskChord contract.",
      );
      return;
    }
    try {
      const draft = await this.#drafts.create(
        parsed.contract.id,
        model.item.repository,
        renderContractDocument(result.value.title, result.value.body),
        result.value,
      );
      const document = await this.#drafts.open(draft);
      this.#updateDiagnostics(document);
    } catch (error) {
      void vscode.window.showErrorMessage(failureMessage(error));
    }
  }

  async previewAndSubmit(): Promise<void> {
    if (!this.#ensureTrusted()) {
      return;
    }
    const document = vscode.window.activeTextEditor?.document;
    const draft = document === undefined ? undefined : this.#drafts.find(document.uri);
    if (document === undefined || draft === undefined) {
      void vscode.window.showInformationMessage("Open a TaskChord contract draft first.");
      return;
    }
    if (draft.repository.isArchived || !draft.repository.canWrite) {
      void vscode.window.showErrorMessage(
        draft.repository.isArchived
          ? "This repository is archived and cannot accept Issue writes."
          : "The stored GitHub session does not have Issue write permission for this repository.",
      );
      return;
    }
    const snapshot = parseContractDocument(document.getText());
    if (snapshot.parsedBody.kind !== "contract") {
      void vscode.window.showErrorMessage(
        "The draft does not contain a supported TaskChord contract.",
      );
      return;
    }
    const invalid = validateSnapshot(snapshot.title, snapshot.body);
    if (invalid !== undefined) {
      void vscode.window.showErrorMessage(invalid);
      return;
    }
    const findings = scaffoldFindings(snapshot.title, snapshot.parsedBody.contract);
    const preview = renderIssueWritePreview({
      repository: draft.repository,
      mode: draft.mode,
      ...(draft.issueNumber === undefined ? {} : { issueNumber: draft.issueNumber }),
      title: snapshot.title,
      body: snapshot.body,
      findings,
    });
    const previewUri = this.#previews.set(draft.id, preview);
    const previewDocument = await vscode.workspace.openTextDocument(previewUri);
    await vscode.window.showTextDocument(previewDocument, {
      preview: true,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
    const gapWarning =
      findings.length === 0
        ? "Intent Scaffold is complete."
        : `Intent Scaffold gaps: ${findings.map((finding) => `${finding.severity} ${finding.field}`).join(", ")}.`;
    const approval = await vscode.window.showWarningMessage(
      `${gapWarning} Submit exactly the title and body shown in the read-only preview to ${draft.repository.nameWithOwner}?`,
      { modal: true },
      "Submit exact snapshot",
    );
    if (approval !== "Submit exact snapshot") {
      return;
    }

    const confirmed = confirmIssueWrite({
      repository: draft.repository,
      mode: draft.mode,
      ...(draft.issueNumber === undefined ? {} : { issueNumber: draft.issueNumber }),
      title: snapshot.title,
      body: snapshot.body,
      findings,
      ...(draft.baseTitle === undefined ? {} : { baseTitle: draft.baseTitle }),
      ...(draft.baseBody === undefined ? {} : { baseBody: draft.baseBody }),
    });

    if (draft.mode === "create" && draft.createAmbiguous === true) {
      const reconciled = await this.#github.reconcileCreate(
        draft.repository,
        snapshot.parsedBody.contract.id,
      );
      if (!reconciled.ok) {
        this.#showFailure(reconciled.failure.detail, reconciled.failure.nextAction);
        return;
      }
      if (reconciled.value !== null) {
        await this.#completeWrite(draft, reconciled.value, "adopted");
        return;
      }
      const retryApproval = await vscode.window.showWarningMessage(
        "No matching Issue was found in the latest 100 open or closed Issues. GitHub provides no idempotency guarantee. Create a new attempt with the exact previewed snapshot?",
        { modal: true },
        "Create new attempt",
      );
      if (retryApproval !== "Create new attempt") {
        return;
      }
    }

    const result =
      draft.mode === "create"
        ? await this.#github.createIssue(confirmed)
        : await this.#github.editIssue(confirmed);
    if (!result.ok) {
      if (draft.mode === "create" && result.failure.kind === "ambiguous") {
        await this.#drafts.update({ ...draft, createAmbiguous: true });
      }
      this.#showFailure(result.failure.detail, result.failure.nextAction);
      return;
    }
    await this.#completeWrite(draft, result.value.issue, result.value.resolution);
  }

  async openOnGitHub(model: WorkTreeModel | undefined): Promise<void> {
    if (!this.#ensureTrusted()) {
      return;
    }
    if (model?.kind !== "issue") {
      void vscode.window.showInformationMessage("Select an Issue in Work first.");
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(model.item.issue.url));
  }

  async setActiveGoal(model: WorkTreeModel | undefined): Promise<void> {
    if (!this.#ensureTrusted()) {
      return;
    }
    if (model?.kind !== "issue" || model.item.parsedBody.kind !== "contract") {
      void vscode.window.showInformationMessage("Select a TaskChord contract Issue in Work first.");
      return;
    }
    const latest = await this.#github.viewIssue(model.item.repository, model.item.issue.number);
    if (!latest.ok) {
      this.#showFailure(latest.failure.detail, latest.failure.nextAction);
      return;
    }
    const parsed = parseIssueBody(latest.value.body);
    if (parsed.kind !== "contract") {
      void vscode.window.showWarningMessage(
        "The Issue is no longer a supported TaskChord contract.",
      );
      return;
    }
    const findings = handoffFindings(latest.value.title, parsed.contract);
    if (findings.length > 0) {
      void vscode.window.showWarningMessage(
        `Active Goal is blocked until these fields are complete: ${findings.map((finding) => finding.field).join(", ")}.`,
      );
      return;
    }
    const goal: ActiveGoal = {
      repository: model.item.repository.nameWithOwner,
      issueNumber: latest.value.number,
      issueTitle: latest.value.title,
      issueUrl: latest.value.url,
      contractId: parsed.contract.id,
      goal: parsed.contract.goal,
      setAt: new Date().toISOString(),
    };
    await this.#context.workspaceState.update(ACTIVE_GOAL_KEY, goal);
    this.#updateGoalProjection();
    await this.refresh();
  }

  async clearActiveGoal(): Promise<void> {
    if (!this.#ensureTrusted()) {
      return;
    }
    await this.#context.workspaceState.update(ACTIVE_GOAL_KEY, undefined);
    this.#updateGoalProjection();
    if (this.provider.state.kind === "ready") {
      this.provider.update({
        kind: "ready",
        repository: this.provider.state.repository,
        items: this.provider.state.items,
        truncated: this.provider.state.truncated,
      });
    }
  }

  async copyCodexHandoff(model: WorkTreeModel | undefined): Promise<void> {
    if (!this.#ensureTrusted()) {
      return;
    }
    const goal = this.#activeGoal();
    if (goal === undefined) {
      void vscode.window.showInformationMessage(
        "Set a complete Issue Contract as the active Goal first.",
      );
      return;
    }
    const state = this.provider.state;
    const selected =
      model?.kind === "issue"
        ? model.item
        : state.kind === "ready"
          ? state.items.find(
              (item) =>
                item.repository.nameWithOwner === goal.repository &&
                item.issue.number === goal.issueNumber,
            )
          : undefined;
    if (
      selected === undefined ||
      selected.repository.nameWithOwner !== goal.repository ||
      selected.issue.number !== goal.issueNumber
    ) {
      void vscode.window.showInformationMessage(
        "Refresh Work and select the Issue that owns the active Goal.",
      );
      return;
    }
    const latest = await this.#github.viewIssue(selected.repository, selected.issue.number);
    if (!latest.ok) {
      this.#showFailure(latest.failure.detail, latest.failure.nextAction);
      return;
    }
    const parsed = parseIssueBody(latest.value.body);
    if (parsed.kind !== "contract" || parsed.contract.id !== goal.contractId) {
      void vscode.window.showWarningMessage(
        "The active Goal no longer matches the latest Issue Contract. Set it again from Work.",
      );
      return;
    }
    const findings = handoffFindings(latest.value.title, parsed.contract);
    if (findings.length > 0) {
      void vscode.window.showWarningMessage(
        `Codex handoff is blocked until these fields are complete: ${findings.map((finding) => finding.field).join(", ")}.`,
      );
      return;
    }
    const exactGoal: ActiveGoal = {
      ...goal,
      issueTitle: latest.value.title,
      issueUrl: latest.value.url,
      goal: parsed.contract.goal,
    };
    const handoff = renderCodexHandoff(exactGoal, parsed.contract, selected.repository);
    const previewUri = this.#previews.set(`handoff-${goal.contractId}`, handoff);
    const previewDocument = await vscode.workspace.openTextDocument(previewUri);
    await vscode.window.showTextDocument(previewDocument, {
      preview: true,
      preserveFocus: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
    const approval = await vscode.window.showWarningMessage(
      "Copy exactly the handoff shown in the read-only preview to the clipboard? TaskChord will not start Codex.",
      { modal: true },
      "Copy exact handoff",
    );
    if (approval !== "Copy exact handoff") {
      return;
    }
    await vscode.env.clipboard.writeText(handoff);
    void vscode.window.showInformationMessage("TaskChord Codex handoff copied to the clipboard.");
  }

  dispose(): void {
    for (const disposable of this.#disposables) {
      disposable.dispose();
    }
  }

  #activeGoal(): ActiveGoal | undefined {
    return this.#context.workspaceState.get<ActiveGoal>(ACTIVE_GOAL_KEY);
  }

  #updateGoalProjection(): void {
    const goal = this.#activeGoal();
    void vscode.commands.executeCommand(
      "setContext",
      "taskchord.hasActiveGoal",
      goal !== undefined,
    );
    if (goal === undefined) {
      this.#goalStatus.hide();
      return;
    }
    this.#goalStatus.text = `$(target) TaskChord Goal #${goal.issueNumber}`;
    this.#goalStatus.tooltip = `${goal.repository} · ${goal.issueTitle}\n${goal.goal}`;
    this.#goalStatus.show();
  }

  async #completeWrite(
    draft: DraftMetadata,
    issue: RemoteIssue,
    resolution: "created" | "updated" | "adopted" | "verified",
  ): Promise<void> {
    this.#diagnostics.delete(vscode.Uri.parse(draft.uri));
    const activeGoal = this.#activeGoal();
    if (
      activeGoal?.repository === draft.repository.nameWithOwner &&
      activeGoal.issueNumber === issue.number
    ) {
      const parsed = parseIssueBody(issue.body);
      if (parsed.kind === "contract" && parsed.contract.id === activeGoal.contractId) {
        await this.#context.workspaceState.update(ACTIVE_GOAL_KEY, {
          ...activeGoal,
          issueTitle: issue.title,
          issueUrl: issue.url,
          goal: parsed.contract.goal,
        } satisfies ActiveGoal);
        this.#updateGoalProjection();
      }
    }
    await this.#drafts.remove(draft);
    await this.refresh();
    void vscode.window.showInformationMessage(
      `GitHub Issue #${issue.number} ${resolution}. The completed draft was removed.`,
    );
  }

  #ensureTrusted(): boolean {
    if (canUseWork(vscode.workspace.isTrusted)) {
      return true;
    }
    this.provider.update({ kind: "untrusted" });
    void vscode.commands.executeCommand("setContext", "taskchord.workState", "untrusted");
    void vscode.window.showWarningMessage("Trust this workspace to use TaskChord Work commands.");
    return false;
  }

  async #repository(): Promise<RepositoryRef | undefined> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      this.#showFailure("No workspace folder is open.", "Open a Git repository, then retry.");
      return undefined;
    }
    const stored = this.#context.workspaceState.get<string>(SELECTED_REPOSITORY_KEY);
    const folder =
      folders.length === 1
        ? folders[0]
        : folders.find((candidate) => candidate.uri.toString() === stored);
    if (folder === undefined) {
      this.provider.update({ kind: "select-repository" });
      await vscode.commands.executeCommand("setContext", "taskchord.workState", "selectRepository");
      return undefined;
    }
    const result = await this.#github.resolveRepository(folder.uri.toString(), folder.uri.fsPath);
    if (!result.ok) {
      this.#showFailure(result.failure.detail, result.failure.nextAction);
      return undefined;
    }
    return result.value;
  }

  #showFailure(message: string, nextAction: string): void {
    this.provider.update({ kind: "error", message, nextAction });
    void vscode.commands.executeCommand("setContext", "taskchord.workState", "error");
    void vscode.window.showErrorMessage(`${message} ${nextAction}`);
  }

  #updateDiagnostics(document: vscode.TextDocument): void {
    const draft = this.#drafts.find(document.uri);
    if (draft === undefined) {
      return;
    }
    const parsed = parseContractDocument(document.getText());
    if (parsed.parsedBody.kind !== "contract") {
      this.#diagnostics.set(document.uri, [
        new vscode.Diagnostic(
          document.lineAt(0).range,
          parsed.parsedBody.kind === "contract-newer"
            ? `TaskChord contract v${parsed.parsedBody.version} is newer than this extension and is read-only.`
            : "A supported TaskChord contract marker is required.",
          vscode.DiagnosticSeverity.Error,
        ),
      ]);
      return;
    }
    const findings = scaffoldFindings(parsed.title, parsed.parsedBody.contract);
    this.#diagnostics.set(
      document.uri,
      findings.map((finding) => {
        const diagnostic = new vscode.Diagnostic(
          fieldRange(document, finding.field),
          `${finding.message} Example: ${finding.example}`,
          finding.severity === "required"
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = "TaskChord Intent Scaffold";
        return diagnostic;
      }),
    );
  }

  async #setDraftContext(document: vscode.TextDocument | undefined): Promise<void> {
    const isDraft = document !== undefined && this.#drafts.find(document.uri) !== undefined;
    await vscode.commands.executeCommand("setContext", "taskchord.isContractDraft", isDraft);
    if (document !== undefined && isDraft) {
      this.#updateDiagnostics(document);
    }
  }
}
