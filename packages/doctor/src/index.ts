import * as os from "node:os";
import process from "node:process";
import {
  type CheckStatus,
  DOCTOR_SCHEMA_VERSION,
  type DoctorCheck,
  type DoctorReport,
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

function environmentName(kind: EnvironmentKind): string {
  const names: Record<EnvironmentKind, string> = {
    windows: "Windows",
    wsl: "WSL",
    macos: "macOS",
    linux: "Linux",
    unknown: "Unknown",
  };

  return names[kind];
}

function summarize(status: CheckStatus): DoctorReport["summary"] {
  return {
    status,
    ready: status === "ready" ? 1 : 0,
    unverified: status === "unverified" ? 1 : 0,
    failed: status === "failed" ? 1 : 0,
  };
}

function createCheck(environment: EnvironmentFacts, status: CheckStatus): DoctorCheck {
  const name = environmentName(environment.kind);

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

export function runDoctor(runtime: DoctorRuntime = systemDoctorRuntime): DoctorReport {
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

    return {
      schemaVersion: DOCTOR_SCHEMA_VERSION,
      generatedAt,
      environment,
      checks: [createCheck(environment, status)],
      summary: summarize(status),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown environment detection error.";
    const environment: EnvironmentFacts = {
      kind: "unknown",
      platform: "unknown",
      architecture: "unknown",
      release: "unknown",
    };

    return {
      schemaVersion: DOCTOR_SCHEMA_VERSION,
      generatedAt,
      environment,
      checks: [
        {
          id: "environment",
          label: "Environment",
          status: "failed",
          message: `Environment detection failed: ${message}`,
          evidence: {},
        },
      ],
      summary: summarize("failed"),
    };
  }
}
