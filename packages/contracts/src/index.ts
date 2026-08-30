export const DOCTOR_SCHEMA_VERSION = 1 as const;

export type EnvironmentKind = "windows" | "wsl" | "macos" | "linux" | "unknown";

export type CheckStatus = "ready" | "unverified" | "failed";

export type DoctorCheckId = string;

export interface EnvironmentFacts {
  kind: EnvironmentKind;
  platform: string;
  architecture: string;
  release: string;
}

export interface DoctorCheck {
  id: DoctorCheckId;
  label: string;
  status: CheckStatus;
  message: string;
  evidence: Record<string, string>;
}

export interface DoctorSummary {
  status: CheckStatus;
  ready: number;
  unverified: number;
  failed: number;
}

export interface DoctorReport {
  schemaVersion: typeof DOCTOR_SCHEMA_VERSION;
  generatedAt: string;
  /** The execution environment of the TaskChord doctor process. */
  environment: EnvironmentFacts;
  checks: DoctorCheck[];
  summary: DoctorSummary;
}
