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

export const ISSUE_CONTRACT_VERSION = 1 as const;

export type ContractField =
  | "title"
  | "outcome"
  | "boundaries"
  | "acceptance"
  | "verification"
  | "goal";

export interface IssueContract {
  id: string;
  outcome: string;
  boundaries: string;
  acceptance: string;
  verification: string;
  goal: string;
  prefix: string;
  suffix: string;
}

export type ParsedIssueBody =
  | { kind: "contract"; version: typeof ISSUE_CONTRACT_VERSION; contract: IssueContract }
  | { kind: "contract-newer"; version: number }
  | { kind: "unstructured" };

export interface RepositoryRef {
  workspaceFolderUri: string;
  workspacePath: string;
  nameWithOwner: string;
  url: string;
  hasIssuesEnabled: boolean;
  isArchived: boolean;
  canWrite: boolean;
}

export interface RemoteIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  updatedAt: string;
  authorLogin: string;
}

export interface WorkItem {
  repository: RepositoryRef;
  issue: RemoteIssue;
  parsedBody: ParsedIssueBody;
}

export interface ScaffoldFinding {
  field: ContractField;
  severity: "required" | "recommended";
  message: string;
  example: string;
}

export interface ActiveGoal {
  repository: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  contractId: string;
  goal: string;
  setAt: string;
}

export type GhFailureKind =
  | "denied"
  | "missing"
  | "unauthenticated"
  | "timeout"
  | "forbidden"
  | "not-found"
  | "issues-disabled"
  | "archived"
  | "read-only"
  | "invalid-output"
  | "ambiguous"
  | "error";

export interface GhFailure {
  kind: GhFailureKind;
  detail: string;
  nextAction: string;
}

export type GhResult<T> = { ok: true; value: T } | { ok: false; failure: GhFailure };
