export const DOCTOR_SCHEMA_VERSION = 2 as const;

export type EnvironmentKind = "windows" | "wsl" | "macos" | "linux" | "unknown";

export type CheckStatus = "ready" | "unverified" | "failed";

export type DoctorCheckId = string;

export type DoctorCheckSource = "runtime" | "process" | "native-codex-doctor";

export interface EnvironmentFacts {
  kind: EnvironmentKind;
  platform: string;
  architecture: string;
  release: string;
}

export interface DoctorTarget {
  id: string;
  kind: EnvironmentKind;
  label: string;
  facts: EnvironmentFacts;
}

export interface DoctorCheck {
  id: DoctorCheckId;
  targetId: string;
  label: string;
  status: CheckStatus;
  source: DoctorCheckSource;
  message: string;
  evidence: Record<string, string>;
  durationMs: number;
  nextAction?: string;
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
  targets: DoctorTarget[];
  checks: DoctorCheck[];
  summary: DoctorSummary;
}
