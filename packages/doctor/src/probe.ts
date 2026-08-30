import { execFile } from "node:child_process";
import process from "node:process";

export type ProbeCommand = "git" | "node" | "gh" | "codex" | "wsl";
export type ProbeOutcome = "completed" | "not-found" | "timeout" | "denied" | "error";

export interface ProbeRequest {
  command: ProbeCommand;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  stdin?: string;
  maxBufferBytes?: number;
}

export interface ProbeResult {
  outcome: ProbeOutcome;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ProcessProbe {
  run(request: ProbeRequest): Promise<ProbeResult>;
}

const ALLOWED_COMMANDS = new Set<ProbeCommand>(["git", "node", "gh", "codex", "wsl"]);
const SENSITIVE_ENVIRONMENT_NAME = /TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|KEY/iu;

export function filteredEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !SENSITIVE_ENVIRONMENT_NAME.test(name)),
  );
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export const nodeProcessProbe: ProcessProbe = {
  run(request) {
    const startedAt = performance.now();
    if (!ALLOWED_COMMANDS.has(request.command)) {
      return Promise.resolve({
        outcome: "denied",
        exitCode: null,
        stdout: "",
        stderr: "",
        durationMs: elapsedSince(startedAt),
      });
    }

    return new Promise((resolve) => {
      const child = execFile(
        request.command,
        [...request.args],
        {
          cwd: request.cwd,
          env: filteredEnvironment(),
          encoding: "utf8",
          maxBuffer: Math.min(Math.max(request.maxBufferBytes ?? 1_048_576, 1_024), 8_388_608),
          timeout: request.timeoutMs,
          killSignal: "SIGKILL",
          windowsHide: true,
          shell: false,
          signal: request.signal,
        },
        (error, stdout, stderr) => {
          const durationMs = elapsedSince(startedAt);
          if (error === null) {
            resolve({ outcome: "completed", exitCode: 0, stdout, stderr, durationMs });
            return;
          }

          if (error.code === "ENOENT") {
            resolve({ outcome: "not-found", exitCode: null, stdout, stderr, durationMs });
            return;
          }

          if (error.killed || error.code === "ABORT_ERR") {
            resolve({ outcome: "timeout", exitCode: null, stdout, stderr, durationMs });
            return;
          }

          if (typeof error.code === "number") {
            resolve({
              outcome: "completed",
              exitCode: error.code,
              stdout,
              stderr,
              durationMs,
            });
            return;
          }

          resolve({ outcome: "error", exitCode: null, stdout, stderr, durationMs });
        },
      );
      child.stdin?.on("error", () => {
        // The callback above owns process errors; EPIPE must not become an uncaught event.
      });
      child.stdin?.end(request.stdin ?? "");
    });
  },
};

export const deniedProcessProbe: ProcessProbe = {
  async run() {
    return {
      outcome: "denied",
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
    };
  },
};
