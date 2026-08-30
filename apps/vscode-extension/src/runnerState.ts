import type { OptionalRunnerReport } from "@taskchord/runners";
import * as vscode from "vscode";

/**
 * Ephemeral optional-runner state shared by native TaskChord surfaces.
 *
 * This store deliberately has no persistence. Its value changes only when the
 * explicit runner-refresh command supplies a new report.
 */
export class RunnerStateStore implements vscode.Disposable {
  readonly #onDidChange = new vscode.EventEmitter<OptionalRunnerReport>();
  readonly onDidChange = this.#onDidChange.event;
  #report: OptionalRunnerReport | undefined;

  get report(): OptionalRunnerReport | undefined {
    return this.#report;
  }

  update(report: OptionalRunnerReport): void {
    this.#report = report;
    this.#onDidChange.fire(report);
  }

  dispose(): void {
    this.#onDidChange.dispose();
  }
}
