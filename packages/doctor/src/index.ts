import * as os from "node:os";
import process from "node:process";
import {
  type CheckStatus,
  DOCTOR_SCHEMA_VERSION,
  type DoctorCheck,
  type DoctorReport,
  type DoctorSummary,
  type EnvironmentFacts,
  type EnvironmentKind,
} from "@taskchord/contracts";

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

  return {
    status,
    ready,
    unverified,
    failed,
  };
}

function createCheck(environment: EnvironmentFacts, status: CheckStatus): DoctorCheck {
  const name = environmentDisplayName(environment.kind);

  return {
    id: "environment",
    label: "Environment",
    status,
    message:
      status === "ready"
        ? `Detected ${name}.`
        : `The current platform could not be classified safely (${environment.platform}).`,
    evidence: {
      platform: environment.platform,
      architecture: environment.architecture,
      release: environment.release,
    },
  };
}

export async function runDoctor(
  runtime: DoctorRuntime = systemDoctorRuntime,
): Promise<DoctorReport> {
  let generatedAt = new Date(0).toISOString();

  try {
    generatedAt = runtime.now().toISOString();
  } catch {
    // A failed clock must not hide the actual environment check.
  }

  try {
    const platform = runtime.platform();
    const release = runtime.release();
    const architecture = runtime.architecture();
    const kind = detectEnvironment({
      platform,
      environment: runtime.environment(),
      release,
    });
    const environment: EnvironmentFacts = {
      kind,
      platform,
      architecture,
      release,
    };
    const status: CheckStatus = kind === "unknown" ? "unverified" : "ready";

    const checks = [createCheck(environment, status)];

    return {
      schemaVersion: DOCTOR_SCHEMA_VERSION,
      generatedAt,
      environment,
      checks,
      summary: summarizeChecks(checks),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown environment detection error.";
    const environment: EnvironmentFacts = {
      kind: "unknown",
      platform: "unknown",
      architecture: "unknown",
      release: "unknown",
    };

    const checks: DoctorCheck[] = [
      {
        id: "environment",
        label: "Environment",
        status: "failed",
        message: `Environment detection failed: ${message}`,
        evidence: {},
      },
    ];

    return {
      schemaVersion: DOCTOR_SCHEMA_VERSION,
      generatedAt,
      environment,
      checks,
      summary: summarizeChecks(checks),
    };
  }
}
