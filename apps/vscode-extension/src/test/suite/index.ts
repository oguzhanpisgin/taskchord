import assert from "node:assert/strict";
import { DOCTOR_SCHEMA_VERSION, type DoctorReport } from "@taskchord/contracts";
import * as vscode from "vscode";

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("taskchord.taskchord");
  assert.ok(extension, "TaskChord extension must be installed in the development host.");

  await extension.activate();
  assert.equal(extension.isActive, true, "TaskChord extension must activate.");

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
    welcomeViews,
    ["taskchord.setup", "taskchord.work", "taskchord.proof"],
    "Setup, Work, and Proof must use native empty-state welcome content.",
  );

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("taskchord.runDoctor"), "Run Doctor command must be registered.");
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
}
