import type { CheckStatus } from "@taskchord/contracts";

export interface NativeCodexDoctorOutcome {
  status: CheckStatus;
  message: string;
  evidence: Record<string, string>;
  nextAction?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseNativeCodexDoctor(json: string): NativeCodexDoctorOutcome | undefined {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.checks)) {
    return undefined;
  }

  let ok = 0;
  let warning = 0;
  let fail = 0;
  let unknown = 0;
  for (const check of Object.values(value.checks)) {
    if (!isRecord(check) || typeof check.status !== "string") {
      unknown += 1;
      continue;
    }
    if (check.status === "ok") {
      ok += 1;
    } else if (check.status === "warning") {
      warning += 1;
    } else if (check.status === "fail") {
      fail += 1;
    } else {
      unknown += 1;
    }
  }

  const total = ok + warning + fail + unknown;
  if (total === 0) {
    return undefined;
  }
  const overallStatus = typeof value.overallStatus === "string" ? value.overallStatus : "unknown";
  const status: CheckStatus =
    fail > 0 || overallStatus === "fail"
      ? "failed"
      : warning > 0 || unknown > 0 || overallStatus !== "ok"
        ? "unverified"
        : "ready";
  const evidence: Record<string, string> = {
    schemaVersion: "1",
    total: String(total),
    ok: String(ok),
    warning: String(warning),
    fail: String(fail),
  };
  if (typeof value.codexVersion === "string") {
    evidence.codexVersion = value.codexVersion;
  }
  if (unknown > 0) {
    evidence.unknown = String(unknown);
  }

  return {
    status,
    message:
      status === "ready"
        ? "Native Codex Doctor completed without warnings or failures."
        : "Native Codex Doctor reported items that need review.",
    evidence,
    ...(status === "ready"
      ? {}
      : { nextAction: "Run codex doctor to review its native findings." }),
  };
}
