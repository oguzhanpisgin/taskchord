import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DOCTOR_SCHEMA_VERSION, type DoctorReport } from "@taskchord/contracts";
import type { VerificationScript } from "@taskchord/proof";
import * as vscode from "vscode";
import { VscodeProofTaskRunner } from "../../proofTaskRunner.js";

async function runUntrustedHandlerSmoke(): Promise<void> {
  assert.equal(
    vscode.workspace.isTrusted,
    false,
    "The untrusted smoke host must open the workspace without trust.",
  );
  const startedTaskChordRuns: string[] = [];
  const subscription = vscode.tasks.onDidStartTask((event) => {
    if (event.execution.task.definition.type === "taskchord-proof") {
      startedTaskChordRuns.push(String(event.execution.task.definition.runId));
    }
  });
  try {
    for (const command of [
      "taskchord.runners.refresh",
      "taskchord.runners.openSettings",
      "taskchord.proof.runBuild",
      "taskchord.proof.runTests",
      "taskchord.proof.accept",
    ]) {
      await vscode.commands.executeCommand(command);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.deepEqual(
      startedTaskChordRuns,
      [],
      "Proof handlers must not start a TaskChord task in an untrusted workspace.",
    );
  } finally {
    subscription.dispose();
  }
}

async function runOwnedVerificationTaskSmoke(folder: vscode.WorkspaceFolder): Promise<void> {
  const packageJson = JSON.parse(
    new TextDecoder().decode(
      await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, "package.json")),
    ),
  ) as { scripts?: Record<string, unknown> };
  const definitions = [
    { kind: "build" as const, name: "build" },
    { kind: "tests" as const, name: "test:unit" },
  ];
  const scripts: VerificationScript[] = definitions.map(({ kind, name }) => {
    const body = packageJson.scripts?.[name];
    if (typeof body !== "string") {
      throw new Error(`Root package.json must define ${name}.`);
    }
    return {
      kind,
      name,
      body,
      definitionHash: createHash("sha256")
        .update("pnpm")
        .update("\0")
        .update(name)
        .update("\0")
        .update(body)
        .digest("hex"),
      manager: "pnpm",
      runnerCommand: ["pnpm", "run", name],
    };
  });
  const startedRunIds: string[] = [];
  const subscription = vscode.tasks.onDidStartTask((event) => {
    if (event.execution.task.definition.type === "taskchord-proof") {
      startedRunIds.push(String(event.execution.task.definition.runId));
    }
  });
  try {
    const runner = new VscodeProofTaskRunner();
    const results = [];
    for (const script of scripts) results.push(await runner.run(folder, script));
    assert.equal(
      new Set(results.map((result) => result.runId)).size,
      2,
      "Each verification task must receive a distinct runId.",
    );
    assert.deepEqual(
      startedRunIds,
      results.map((result) => result.runId),
      "The runner must observe exactly the TaskChord tasks carrying its internal runIds.",
    );
    for (const result of results) {
      assert.match(
        result.runId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      assert.ok(Number.isFinite(Date.parse(result.startedAt)), "Task start time must be captured.");
      assert.ok(Number.isFinite(Date.parse(result.finishedAt)), "Task end time must be captured.");
      assert.ok(
        Date.parse(result.finishedAt) >= Date.parse(result.startedAt),
        "Task finish time must not precede its start time.",
      );
      assert.equal(result.exitCode, 0, "The exact root verification task must pass.");
    }
  } finally {
    subscription.dispose();
  }
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("taskchord.taskchord");
  assert.ok(extension, "TaskChord extension must be installed in the development host.");

  await extension.activate();
  assert.equal(extension.isActive, true, "TaskChord extension must activate.");

  if (process.env.TASKCHORD_SMOKE_MODE === "untrusted") {
    await runUntrustedHandlerSmoke();
    return;
  }

  const containers = extension.packageJSON.contributes?.viewsContainers?.activitybar as
    | Array<{ id: string; title: string }>
    | undefined;
  assert.ok(
    containers?.some(
      (container) =>
        container.id === "taskchord-workbench" && container.title === "TaskChord Workbench",
    ),
    "TaskChord Workbench must contribute a valid native Activity Bar container.",
  );

  const views = extension.packageJSON.contributes?.views?.["taskchord-workbench"] as
    | Array<{ id: string }>
    | undefined;
  assert.deepEqual(
    views?.map((view) => view.id),
    ["taskchord.setup", "taskchord.work", "taskchord.proof"],
    "TaskChord Workbench must contribute Setup, Work, and Proof views.",
  );

  const welcomeViews = (
    extension.packageJSON.contributes?.viewsWelcome as Array<{ view: string }> | undefined
  )?.map((entry) => entry.view);
  assert.deepEqual(
    [...new Set(welcomeViews)],
    ["taskchord.setup", "taskchord.work", "taskchord.proof"],
    "Setup, Work, and Proof must use native empty-state welcome content.",
  );

  assert.equal(
    extension.packageJSON.capabilities?.untrustedWorkspaces?.supported,
    "limited",
    "Work must be limited in untrusted workspaces while Doctor remains available.",
  );
  const menuGroups = extension.packageJSON.contributes?.menus as
    | Record<string, Array<{ command: string; when?: string }>>
    | undefined;
  const visibleWorkMenus = Object.values(menuGroups ?? {})
    .flat()
    .filter((entry) => entry.command.startsWith("taskchord.work.") && entry.when !== "false");
  assert.ok(
    visibleWorkMenus.every((entry) => entry.when?.includes("isWorkspaceTrusted")),
    "Every visible Work menu entry must be hidden in untrusted workspaces.",
  );
  const visibleProofMenus = Object.values(menuGroups ?? {})
    .flat()
    .filter((entry) => entry.command.startsWith("taskchord.proof.") && entry.when !== "false");
  assert.ok(
    visibleProofMenus.every((entry) => entry.when?.includes("isWorkspaceTrusted")),
    "Every visible Proof menu entry must be hidden in untrusted workspaces.",
  );
  const visibleRunnerMenus = Object.values(menuGroups ?? {})
    .flat()
    .filter((entry) => entry.command.startsWith("taskchord.runners.") && entry.when !== "false");
  assert.ok(
    visibleRunnerMenus.every((entry) => entry.when?.includes("isWorkspaceTrusted")),
    "Every visible optional-runner menu entry must be hidden in untrusted workspaces.",
  );
  const workTitleMenus = menuGroups?.["view/title"] ?? [];
  for (const command of ["taskchord.runners.refresh", "taskchord.runners.openSettings"]) {
    assert.ok(
      workTitleMenus.some(
        (entry) =>
          entry.command === command &&
          entry.when === "view == taskchord.work && isWorkspaceTrusted",
      ),
      `${command} must be available from the trusted native Work view.`,
    );
  }
  const handoffMenu = (menuGroups?.["view/item/context"] ?? []).find(
    (entry) => entry.command === "taskchord.work.copyCodexHandoff",
  );
  assert.ok(handoffMenu?.when?.includes("taskchord.hasActiveGoal"));
  assert.ok(
    !handoffMenu?.when?.includes("runner"),
    "Codex handoff visibility must not depend on optional-runner state.",
  );

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("taskchord.runDoctor"), "Run Doctor command must be registered.");
  assert.ok(
    commands.includes("taskchord.runners.refresh"),
    "Refresh Runner Status command must be registered.",
  );
  assert.ok(
    commands.includes("taskchord.runners.openSettings"),
    "Open Runner Settings command must be registered.",
  );
  for (const command of [
    "taskchord.work.refresh",
    "taskchord.work.selectRepository",
    "taskchord.work.newContract",
    "taskchord.work.editContract",
    "taskchord.work.previewAndSubmit",
    "taskchord.work.openOnGitHub",
    "taskchord.work.setActiveGoal",
    "taskchord.work.clearActiveGoal",
    "taskchord.work.copyCodexHandoff",
    "taskchord.proof.refresh",
    "taskchord.proof.selectRepository",
    "taskchord.proof.openDetails",
    "taskchord.proof.runBuild",
    "taskchord.proof.runTests",
    "taskchord.proof.accept",
    "taskchord.proof.requestChanges",
    "taskchord.proof.clearDecision",
  ]) {
    assert.ok(commands.includes(command), `${command} must be registered.`);
  }
  await vscode.commands.executeCommand("taskchord.work.editContract");
  await vscode.commands.executeCommand("taskchord.work.openOnGitHub");
  for (const viewId of ["taskchord.setup", "taskchord.work", "taskchord.proof"]) {
    assert.ok(commands.includes(`${viewId}.focus`), `${viewId} must be a registered native view.`);
  }

  const report = await vscode.commands.executeCommand<DoctorReport>("taskchord.runDoctor");
  assert.equal(
    report.schemaVersion,
    DOCTOR_SCHEMA_VERSION,
    "Run Doctor must return the shared DoctorReport contract.",
  );
  assert.notEqual(report.environment.kind, "unknown", "The integration host must be detected.");
  const environmentCheck = report.checks.find((check) => check.id === "environment");
  assert.equal(environmentCheck?.status, "ready", "The integration host must be ready.");
  assert.ok(report.checks.length >= 6, "Run Doctor must return the Doctor Aggregator checks.");
  const targetIds = new Set(report.targets.map((target) => target.id));
  for (const check of report.checks) {
    assert.ok(check.id.length > 0, "Every Doctor check must have an id.");
    assert.ok(check.label.length > 0, "Every Doctor check must have a label.");
    assert.ok(targetIds.has(check.targetId), "Every Doctor check must resolve to a target.");
  }

  assert.equal(vscode.workspace.isTrusted, true, "The smoke workspace must be trusted.");
  assert.ok(vscode.workspace.workspaceFolders?.[0], "The smoke test must open a workspace folder.");
  const draftResult = await vscode.commands.executeCommand<vscode.Uri>(
    "taskchord.work.newContract",
  );
  assert.ok(
    draftResult instanceof vscode.Uri,
    `New Contract must open a native editor document. Result: ${String(draftResult)}. GitHub check: ${report.checks.find((check) => check.id === "github-cli-auth")?.message ?? "missing"}`,
  );
  const draft = await vscode.workspace.openTextDocument(draftResult);
  assert.equal(
    draft.languageId,
    "markdown",
    "Contract drafts must use the native Markdown editor.",
  );
  assert.match(
    draft.getText(),
    /<!-- taskchord:contract v=1 id=[0-9a-f-]+ -->/u,
    "The draft must contain a versioned contract marker.",
  );
  assert.ok(
    draft.uri.fsPath.includes("workspaceStorage"),
    "Contract drafts must use VS Code extension workspace storage.",
  );
  const diagnostics = vscode.languages.getDiagnostics(draft.uri);
  assert.ok(
    diagnostics.some((diagnostic) => diagnostic.source === "TaskChord Intent Scaffold"),
    "Intent Scaffold must report missing contract fields in the native editor.",
  );
  await runOwnedVerificationTaskSmoke(vscode.workspace.workspaceFolders[0]);
}
