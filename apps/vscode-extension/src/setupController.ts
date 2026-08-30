import type { DoctorReport } from "@taskchord/contracts";
import { deniedProcessProbe, nodeProcessProbe, runDoctor } from "@taskchord/doctor";
import { observeOptionalRunners, type SymphonySettings } from "@taskchord/runners";
import * as vscode from "vscode";
import type { RunnerStateStore } from "./runnerState.js";
import type { SetupTreeDataProvider } from "./setupTree.js";

function settings(): SymphonySettings {
  const configuration = vscode.workspace.getConfiguration("taskchord.runners.symphony");
  return {
    enabled: configuration.get<boolean>("enabled", true),
    port: configuration.get<number>("port", 4000),
  };
}

export class SetupController {
  constructor(
    private readonly provider: SetupTreeDataProvider,
    private readonly runners: RunnerStateStore,
    private readonly selectedRepository: () => Promise<string | undefined>,
  ) {}

  registerCommands(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand("taskchord.runDoctor", () => this.runDoctor()),
      vscode.commands.registerCommand("taskchord.runners.refresh", () => this.refreshRunners()),
      vscode.commands.registerCommand("taskchord.runners.openSettings", () => this.openSettings()),
    ];
  }

  async runDoctor(): Promise<DoctorReport> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const report = await runDoctor({
      ...(vscode.workspace.isTrusted ? {} : { probe: deniedProcessProbe }),
      ...(vscode.workspace.isTrusted && workspaceRoot !== undefined ? { workspaceRoot } : {}),
    });
    this.provider.update(report);
    return report;
  }

  async refreshRunners(): Promise<void> {
    if (!this.#ensureTrusted()) return;
    const repository = await this.selectedRepository();
    const report = await observeOptionalRunners(settings(), nodeProcessProbe, {
      ...(repository === undefined ? {} : { repository }),
    });
    this.runners.update(report);
    this.provider.updateRunners(report);
  }

  async openSettings(): Promise<void> {
    if (!this.#ensureTrusted()) return;
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "taskchord.runners.symphony",
    );
  }

  #ensureTrusted(): boolean {
    if (vscode.workspace.isTrusted) return true;
    void vscode.window.showWarningMessage(
      "Trust this workspace to refresh optional runner status.",
    );
    return false;
  }
}
