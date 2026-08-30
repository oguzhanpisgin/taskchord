import { randomUUID } from "node:crypto";
import type { SupportedPackageManager, VerificationScript } from "@taskchord/proof";
import * as vscode from "vscode";

export interface ProofTaskResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
}

function strong(value: string): vscode.ShellQuotedString {
  return { value, quoting: vscode.ShellQuoting.Strong };
}

export interface ProofTaskRunner {
  run(folder: vscode.WorkspaceFolder, script: VerificationScript): Promise<ProofTaskResult>;
}

export class VscodeProofTaskRunner implements ProofTaskRunner {
  async run(folder: vscode.WorkspaceFolder, script: VerificationScript): Promise<ProofTaskResult> {
    const runId = randomUUID();
    const definition: vscode.TaskDefinition = { type: "taskchord-proof", runId };
    const [manager, ...args] = script.runnerCommand as readonly [
      SupportedPackageManager,
      ...string[],
    ];
    const task = new vscode.Task(
      definition,
      folder,
      `TaskChord Proof: ${script.name}`,
      "TaskChord",
      new vscode.ShellExecution(manager, args.map(strong), { cwd: folder.uri.fsPath }),
    );
    const requestedAt = new Date().toISOString();

    return await new Promise<ProofTaskResult>((resolve, reject) => {
      let startedAt: string | undefined;
      let settled = false;
      const disposables: vscode.Disposable[] = [];
      const finish = (result: ProofTaskResult): void => {
        if (settled) return;
        settled = true;
        for (const disposable of disposables) disposable.dispose();
        resolve(result);
      };
      disposables.push(
        vscode.tasks.onDidStartTaskProcess((event) => {
          if (event.execution.task.definition.runId === runId) {
            startedAt = new Date().toISOString();
          }
        }),
        vscode.tasks.onDidEndTaskProcess((event) => {
          if (event.execution.task.definition.runId !== runId) return;
          finish({
            runId,
            startedAt: startedAt ?? requestedAt,
            finishedAt: new Date().toISOString(),
            exitCode: event.exitCode ?? null,
          });
        }),
      );
      void vscode.tasks.executeTask(task).then(undefined, (error: unknown) => {
        if (settled) return;
        settled = true;
        for (const disposable of disposables) disposable.dispose();
        reject(error);
      });
    });
  }
}
