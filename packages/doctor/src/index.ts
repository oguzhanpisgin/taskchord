import * as os from "node:os";
import process from "node:process";
import {
  type CheckStatus,
  DOCTOR_SCHEMA_VERSION,
  type DoctorCheck,
  type DoctorCheckSource,
  type DoctorReport,
  type DoctorSummary,
  type DoctorTarget,
  type EnvironmentFacts,
  type EnvironmentKind,
} from "@taskchord/contracts";
import { parseNativeCodexDoctor } from "./codexDoctor.js";
import { nodeProcessProbe, type ProbeResult, type ProcessProbe } from "./probe.js";
import { redactText, summarizeOutput } from "./redaction.js";
import { discoverWslTargets } from "./wsl.js";

export { parseNativeCodexDoctor } from "./codexDoctor.js";
export type {
  ProbeCommand,
  ProbeOutcome,
  ProbeRequest,
  ProbeResult,
  ProcessProbe,
} from "./probe.js";
export { deniedProcessProbe, filteredEnvironment, nodeProcessProbe } from "./probe.js";
export { redactText, summarizeOutput } from "./redaction.js";
export {
  createWslProcessProbe,
  discoverWslTargets,
  parseWslDistributions,
  toWslPath,
} from "./wsl.js";

export interface DoctorRuntime {
  platform(): string;
  environment(): Readonly<Record<string, string | undefined>>;
  release(): string;
  architecture(): string;
  now(): Date;
}

export interface EnvironmentDetectionInput {
  platform: string;
  environment: Readonly<Record<string, string | undefined>>;
  release: string;
}

export interface CheckContext {
  target: DoctorTarget;
  probe: ProcessProbe;
  workspaceRoot: string | undefined;
  signal: AbortSignal;
}

export interface CheckOutcome {
  status: CheckStatus;
  message: string;
  evidence: Record<string, string>;
  nextAction?: string;
}

export interface CheckDefinition {
  id: string;
  label: string;
  source: DoctorCheckSource;
  timeoutMs: number;
  run(context: CheckContext): Promise<CheckOutcome>;
}

export interface DoctorOptions {
  runtime?: DoctorRuntime;
  probe?: ProcessProbe;
  workspaceRoot?: string;
  checks?: readonly CheckDefinition[];
  concurrency?: number;
  timeoutMs?: number;
}

export const systemDoctorRuntime: DoctorRuntime = {
  platform: () => process.platform,
  environment: () => process.env,
  release: () => os.release(),
  architecture: () => os.arch(),
  now: () => new Date(),
};

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function detectEnvironment(input: EnvironmentDetectionInput): EnvironmentKind {
  if (input.platform === "win32") {
    return "windows";
  }
  if (input.platform === "darwin") {
    return "macos";
  }
  if (input.platform !== "linux") {
    return "unknown";
  }

  const isWsl =
    hasValue(input.environment.WSL_DISTRO_NAME) ||
    hasValue(input.environment.WSL_INTEROP) ||
    input.release.toLowerCase().includes("microsoft");
  return isWsl ? "wsl" : "linux";
}

export function environmentDisplayName(kind: EnvironmentKind): string {
  const names: Record<EnvironmentKind, string> = {
    windows: "Windows",
    wsl: "WSL",
    macos: "macOS",
    linux: "Linux",
    unknown: "Unknown",
  };
  return names[kind];
}

export function summarizeChecks(checks: readonly DoctorCheck[]): DoctorSummary {
  const ready = checks.filter((check) => check.status === "ready").length;
  const unverified = checks.filter((check) => check.status === "unverified").length;
  const failed = checks.filter((check) => check.status === "failed").length;
  const status: CheckStatus =
    failed > 0 ? "failed" : unverified > 0 || checks.length === 0 ? "unverified" : "ready";
  return { status, ready, unverified, failed };
}

function targetFor(environment: EnvironmentFacts): DoctorTarget {
  const name = environmentDisplayName(environment.kind);
  return {
    id: `${environment.kind}-host`,
    kind: environment.kind,
    label: `${name} host`,
    facts: environment,
  };
}

function unavailableProbe(
  result: ProbeResult,
  missingMessage: string,
  nextAction: string,
): CheckOutcome | undefined {
  if (result.outcome === "completed") {
    return undefined;
  }
  if (result.outcome === "not-found") {
    return { status: "failed", message: missingMessage, evidence: {}, nextAction };
  }
  return {
    status: "unverified",
    message:
      result.outcome === "denied"
        ? "This check was not run because process access is disabled."
        : "This check could not complete safely.",
    evidence: { outcome: result.outcome },
    nextAction: "Run Doctor from a trusted local workspace and try again.",
  };
}

async function versionCheck(
  context: CheckContext,
  command: "git" | "node",
  displayName: string,
  installAction: string,
): Promise<CheckOutcome> {
  const result = await context.probe.run({
    command,
    args: ["--version"],
    timeoutMs: 3_000,
    signal: context.signal,
  });
  const unavailable = unavailableProbe(
    result,
    `${displayName} was not found on PATH.`,
    installAction,
  );
  if (unavailable !== undefined) {
    return unavailable;
  }
  if (result.exitCode !== 0) {
    return {
      status: "failed",
      message: `${displayName} returned an error.`,
      evidence: { detail: summarizeOutput(result.stderr) },
      nextAction: `Repair ${displayName}, then run Doctor again.`,
    };
  }
  return {
    status: "ready",
    message: `${displayName} is available.`,
    evidence: { version: summarizeOutput(result.stdout) },
  };
}

export function defaultChecks(): readonly CheckDefinition[] {
  return [
    {
      id: "environment",
      label: "Environment",
      source: "runtime",
      timeoutMs: 1_000,
      async run({ target }) {
        const status: CheckStatus =
          target.kind === "unknown" ||
          target.facts.release === "unknown" ||
          target.facts.architecture === "unknown"
            ? "unverified"
            : "ready";
        return {
          status,
          message:
            status === "ready"
              ? `Detected ${environmentDisplayName(target.kind)}.`
              : `The current platform could not be classified safely (${target.facts.platform}).`,
          evidence: {
            platform: target.facts.platform,
            architecture: target.facts.architecture,
            release: target.facts.release,
          },
          ...(status === "unverified"
            ? { nextAction: "Use a supported Windows, WSL, macOS, or Linux host." }
            : {}),
        };
      },
    },
    {
      id: "git",
      label: "Git",
      source: "process",
      timeoutMs: 3_000,
      run: (context) => versionCheck(context, "git", "Git", "Install Git, then run Doctor again."),
    },
    {
      id: "node",
      label: "Node.js",
      source: "process",
      timeoutMs: 3_000,
      run: (context) =>
        versionCheck(context, "node", "Node.js", "Install Node.js, then run Doctor again."),
    },
    {
      id: "github-cli-auth",
      label: "GitHub CLI authentication",
      source: "process",
      timeoutMs: 5_000,
      async run(context) {
        const result = await context.probe.run({
          command: "gh",
          args: ["auth", "status"],
          timeoutMs: 5_000,
          signal: context.signal,
        });
        const unavailable = unavailableProbe(
          result,
          "GitHub CLI was not found on PATH.",
          "Install GitHub CLI and sign in, then run Doctor again.",
        );
        if (unavailable !== undefined) {
          return { ...unavailable, status: "unverified" };
        }
        if (result.exitCode !== 0) {
          return {
            status: "unverified",
            message: "GitHub CLI is installed but no usable stored session was verified.",
            evidence: { authenticated: "no" },
            nextAction: "Sign in with GitHub CLI, then run Doctor again.",
          };
        }
        return {
          status: "ready",
          message: "GitHub CLI has a usable stored session.",
          evidence: { authenticated: "yes" },
        };
      },
    },
    {
      id: "codex-doctor",
      label: "Codex Doctor",
      source: "native-codex-doctor",
      timeoutMs: 10_000,
      async run(context) {
        const version = await context.probe.run({
          command: "codex",
          args: ["--version"],
          timeoutMs: 3_000,
          signal: context.signal,
        });
        if (version.outcome !== "completed") {
          return {
            status: version.outcome === "not-found" ? "failed" : "unverified",
            message:
              version.outcome === "not-found"
                ? "Codex CLI was not found on PATH."
                : "Codex CLI availability could not be verified safely.",
            evidence: { outcome: version.outcome },
            nextAction: "Install or repair Codex CLI, then run Doctor again.",
          };
        }
        if (version.exitCode !== 0) {
          return {
            status: "failed",
            message: "Codex CLI returned an error while reporting its version.",
            evidence: {},
            nextAction: "Repair Codex CLI, then run Doctor again.",
          };
        }

        const nativeDoctor = await context.probe.run({
          command: "codex",
          args: ["doctor", "--json"],
          timeoutMs: 10_000,
          signal: context.signal,
        });
        if (
          nativeDoctor.outcome !== "completed" ||
          (nativeDoctor.exitCode !== 0 && nativeDoctor.exitCode !== 1)
        ) {
          return {
            status: "unverified",
            message: "Native Codex Doctor could not complete safely.",
            evidence: { outcome: nativeDoctor.outcome },
            nextAction: "Run codex doctor manually, then run TaskChord Doctor again.",
          };
        }

        const parsed = parseNativeCodexDoctor(nativeDoctor.stdout);
        if (parsed === undefined) {
          return {
            status: "unverified",
            message: "Native Codex Doctor returned an unrecognized report schema.",
            evidence: { cliVersion: summarizeOutput(version.stdout) },
            nextAction: "Update TaskChord or run codex doctor manually.",
          };
        }
        return {
          ...parsed,
          evidence: {
            cliVersion: summarizeOutput(version.stdout),
            ...parsed.evidence,
          },
        };
      },
    },
    {
      id: "repository",
      label: "Repository",
      source: "process",
      timeoutMs: 5_000,
      async run(context) {
        if (context.workspaceRoot === undefined) {
          return {
            status: "unverified",
            message: "No workspace folder is open.",
            evidence: {},
            nextAction: "Open a repository folder, then run Doctor again.",
          };
        }

        const inside = await context.probe.run({
          command: "git",
          args: ["rev-parse", "--is-inside-work-tree"],
          cwd: context.workspaceRoot,
          timeoutMs: 3_000,
          signal: context.signal,
        });
        if (inside.outcome !== "completed") {
          return {
            status: "unverified",
            message: "Repository status could not be checked safely.",
            evidence: { outcome: inside.outcome },
            nextAction: "Run Doctor from a trusted local workspace and try again.",
          };
        }
        if (inside.exitCode !== 0 || summarizeOutput(inside.stdout) !== "true") {
          return {
            status: "failed",
            message: "The open folder is not a Git working tree.",
            evidence: {},
            nextAction: "Open a Git repository folder, then run Doctor again.",
          };
        }

        const [branch, status] = await Promise.all([
          context.probe.run({
            command: "git",
            args: ["rev-parse", "--abbrev-ref", "HEAD"],
            cwd: context.workspaceRoot,
            timeoutMs: 3_000,
            signal: context.signal,
          }),
          context.probe.run({
            command: "git",
            args: ["status", "--porcelain"],
            cwd: context.workspaceRoot,
            timeoutMs: 3_000,
            signal: context.signal,
          }),
        ]);
        if (
          branch.outcome !== "completed" ||
          branch.exitCode !== 0 ||
          status.outcome !== "completed" ||
          status.exitCode !== 0
        ) {
          return {
            status: "unverified",
            message: "The Git working tree was found, but its state could not be fully checked.",
            evidence: {},
            nextAction: "Verify the repository with Git, then run Doctor again.",
          };
        }

        const branchName = summarizeOutput(branch.stdout);
        const dirtyFileCount = status.stdout
          .split(/\r?\n/u)
          .filter((line) => line.length > 0).length;
        return {
          status: branchName === "HEAD" ? "unverified" : "ready",
          message:
            branchName === "HEAD"
              ? "The repository is in detached HEAD state."
              : "The open folder is a Git working tree.",
          evidence: { branch: branchName, dirtyFileCount: String(dirtyFileCount) },
          ...(branchName === "HEAD"
            ? { nextAction: "Check out a branch, then run Doctor again." }
            : {}),
        };
      },
    },
  ];
}

function sanitizeEvidence(evidence: Record<string, string>): Record<string, string> {
  const entries = Object.entries(evidence).slice(0, 8);
  const sanitized = Object.fromEntries(
    entries.map(([key, value]) => [key, summarizeOutput(value.replace(/\r?\n/gu, " "))]),
  );
  if (Object.keys(evidence).length > entries.length) {
    sanitized.truncated = "yes";
  }
  return sanitized;
}

async function executeCheck(
  definition: CheckDefinition,
  context: Omit<CheckContext, "signal">,
  timeoutCeiling: number,
): Promise<DoctorCheck> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutMs = Math.min(definition.timeoutMs, timeoutCeiling);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<CheckOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        status: "unverified",
        message: "The check timed out.",
        evidence: { outcome: "timeout" },
        nextAction: "Run Doctor again.",
      });
    }, timeoutMs);
  });

  let outcome: CheckOutcome;
  try {
    outcome = await Promise.race([
      definition.run({ ...context, signal: controller.signal }),
      timeout,
    ]);
  } catch (error) {
    outcome = {
      status: "failed",
      message: `The check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      evidence: {},
      nextAction: "Run Doctor again. If the problem continues, review the local tool setup.",
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }

  return {
    id: definition.id,
    targetId: context.target.id,
    label: definition.label,
    status: outcome.status,
    source: definition.source,
    message: summarizeOutput(redactText(outcome.message)),
    evidence: sanitizeEvidence(outcome.evidence),
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...(outcome.nextAction === undefined
      ? {}
      : { nextAction: summarizeOutput(redactText(outcome.nextAction)) }),
  };
}

async function executeChecks(
  definitions: readonly CheckDefinition[],
  context: Omit<CheckContext, "signal">,
  concurrency: number,
  timeoutMs: number,
): Promise<DoctorCheck[]> {
  const results = new Array<DoctorCheck>(definitions.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < definitions.length) {
      const index = cursor;
      cursor += 1;
      const definition = definitions[index];
      if (definition !== undefined) {
        results[index] = await executeCheck(definition, context, timeoutMs);
      }
    }
  }
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, definitions.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function failedEnvironmentReport(generatedAt: string, error: unknown): DoctorReport {
  const environment: EnvironmentFacts = {
    kind: "unknown",
    platform: "unknown",
    architecture: "unknown",
    release: "unknown",
  };
  const target = targetFor(environment);
  const checks: DoctorCheck[] = [
    {
      id: "environment",
      targetId: target.id,
      label: "Environment",
      status: "failed",
      source: "runtime",
      message: summarizeOutput(
        redactText(
          `Environment detection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      ),
      evidence: {},
      durationMs: 0,
      nextAction: "Run Doctor again. If the problem continues, review the local runtime.",
    },
  ];
  return {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    generatedAt,
    environment,
    targets: [target],
    checks,
    summary: summarizeChecks(checks),
  };
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const runtime = options.runtime ?? systemDoctorRuntime;
  let generatedAt = new Date(0).toISOString();
  try {
    generatedAt = runtime.now().toISOString();
  } catch {
    // A failed clock must not hide the actual checks.
  }

  try {
    const platform = runtime.platform();
    const release = runtime.release();
    const architecture = runtime.architecture();
    const environment: EnvironmentFacts = {
      kind: detectEnvironment({
        platform,
        environment: runtime.environment(),
        release,
      }),
      platform,
      architecture,
      release,
    };
    const target = targetFor(environment);
    const definitions = options.checks ?? defaultChecks();
    const processProbe = options.probe ?? nodeProcessProbe;
    const workspaceRoot = options.workspaceRoot ?? process.cwd();
    const checks = await executeChecks(
      definitions,
      {
        target,
        probe: processProbe,
        workspaceRoot,
      },
      options.concurrency ?? 4,
      options.timeoutMs ?? 10_000,
    );
    const targets = [target];
    if (environment.kind === "windows" && options.checks === undefined) {
      const wslTargets = await discoverWslTargets(processProbe, workspaceRoot);
      for (const wslTarget of wslTargets) {
        targets.push(wslTarget.target);
        checks.push(
          ...(await executeChecks(
            definitions,
            {
              target: wslTarget.target,
              probe: wslTarget.probe,
              workspaceRoot: wslTarget.workspaceRoot,
            },
            options.concurrency ?? 4,
            options.timeoutMs ?? 10_000,
          )),
        );
      }
    }
    return {
      schemaVersion: DOCTOR_SCHEMA_VERSION,
      generatedAt,
      environment,
      targets,
      checks,
      summary: summarizeChecks(checks),
    };
  } catch (error) {
    return failedEnvironmentReport(generatedAt, error);
  }
}
