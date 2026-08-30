import { DOCTOR_SCHEMA_VERSION, type DoctorCheck } from "@taskchord/contracts";
import { describe, expect, it } from "vitest";
import {
  type CheckDefinition,
  type DoctorRuntime,
  detectEnvironment,
  type ProbeRequest,
  type ProbeResult,
  type ProcessProbe,
  runDoctor,
  summarizeChecks,
} from "./index.js";

const fixedDate = new Date("2026-08-30T12:00:00.000Z");

function runtime(overrides: Partial<DoctorRuntime> = {}): DoctorRuntime {
  return {
    platform: () => "win32",
    environment: () => ({}),
    release: () => "10.0.26100",
    architecture: () => "x64",
    now: () => fixedDate,
    ...overrides,
  };
}

function completed(stdout = "", exitCode = 0, stderr = ""): ProbeResult {
  return { outcome: "completed", exitCode, stdout, stderr, durationMs: 1 };
}

function probe(
  handler: (request: ProbeRequest) => ProbeResult | Promise<ProbeResult>,
): ProcessProbe {
  return { run: handler };
}

function readyProbe(): ProcessProbe {
  return probe((request) => {
    const key = `${request.command} ${request.args.join(" ")}`;
    const outputs: Record<string, ProbeResult> = {
      "git --version": completed("git version 2.55.0\n"),
      "node --version": completed("v24.19.0\n"),
      "gh auth status": completed("authenticated account\n"),
      "codex --version": completed("codex-cli 0.149.1\n"),
      "codex doctor --json": completed(
        JSON.stringify({
          schemaVersion: 1,
          overallStatus: "ok",
          codexVersion: "0.149.1",
          checks: { runtime: { status: "ok", details: "must not cross the boundary" } },
        }),
      ),
      "git rev-parse --is-inside-work-tree": completed("true\n"),
      "git rev-parse --abbrev-ref HEAD": completed("main\n"),
      "git status --porcelain": completed(" M secret-plan.md\n"),
    };
    return outputs[key] ?? completed();
  });
}

describe("detectEnvironment", () => {
  it.each([
    ["win32", {}, "10.0.26100", "windows"],
    ["darwin", {}, "25.0.0", "macos"],
    ["linux", {}, "6.12.0-generic", "linux"],
    ["freebsd", {}, "15.0", "unknown"],
  ] as const)("classifies %s", (platform, environment, release, expected) => {
    expect(detectEnvironment({ platform, environment, release })).toBe(expected);
  });

  it("detects WSL from environment markers or the Linux release", () => {
    expect(
      detectEnvironment({
        platform: "linux",
        environment: { WSL_DISTRO_NAME: "Ubuntu-24.04" },
        release: "6.6.87.2-generic",
      }),
    ).toBe("wsl");
    expect(
      detectEnvironment({
        platform: "linux",
        environment: {},
        release: "6.6.87.2-microsoft-standard-WSL2",
      }),
    ).toBe("wsl");
  });
});

describe("runDoctor", () => {
  it("returns the five target-bound Part 1 checks", async () => {
    const report = await runDoctor({
      runtime: runtime(),
      probe: readyProbe(),
      workspaceRoot: "C:\\Projects\\taskchord",
    });

    expect(report.schemaVersion).toBe(DOCTOR_SCHEMA_VERSION);
    expect(report.generatedAt).toBe(fixedDate.toISOString());
    expect(report.checks.map((check) => check.id)).toEqual([
      "environment",
      "git",
      "node",
      "github-cli-auth",
      "codex-doctor",
      "repository",
    ]);
    expect(report.summary).toEqual({
      status: "ready",
      ready: 6,
      unverified: 0,
      failed: 0,
    });
    expect(report.checks.every((check) => check.targetId === "windows-host")).toBe(true);
    expect(report.targets.map((target) => target.id)).toEqual(["windows-host"]);
    expect(JSON.stringify(report)).not.toContain("secret-plan.md");
    expect(report.checks.find((check) => check.id === "repository")?.evidence).toEqual({
      branch: "main",
      dirtyFileCount: "1",
    });
  });

  it("keeps Windows and WSL measurements separate", async () => {
    const hostProbe = probe((request) => {
      if (request.command !== "wsl") {
        return readyProbe().run(request);
      }
      if (request.args.join(" ") === "-l -q") {
        return completed("Ubuntu-24.04\ndocker-desktop\n");
      }
      const joined = request.args.join(" ");
      if (joined.endsWith("/usr/bin/uname -r")) {
        return completed("6.6.87.2-microsoft-standard-WSL2\n");
      }
      if (joined.endsWith("/usr/bin/uname -m")) {
        return completed("x86_64\n");
      }
      const separator = request.args.indexOf("--");
      const command = request.args[separator + 3];
      const args = request.args.slice(separator + 4);
      return readyProbe().run({
        command: command as ProbeRequest["command"],
        args,
        timeoutMs: request.timeoutMs,
      });
    });
    const report = await runDoctor({
      runtime: runtime(),
      probe: hostProbe,
      workspaceRoot: "C:\\Projects\\taskchord",
    });
    expect(report.targets.map((target) => target.id)).toEqual(["windows-host", "wsl:ubuntu-24.04"]);
    expect(report.checks).toHaveLength(12);
    expect(report.checks.filter((check) => check.targetId === "wsl:ubuntu-24.04")).toHaveLength(6);
  });

  it("accepts native Codex Doctor exit code 1 when its JSON is valid", async () => {
    const nativeFailureProbe = probe((request) => {
      if (request.command === "codex" && request.args.join(" ") === "doctor --json") {
        return completed(
          JSON.stringify({
            schemaVersion: 1,
            overallStatus: "fail",
            checks: { auth: { status: "fail", details: "not forwarded" } },
          }),
          1,
        );
      }
      return readyProbe().run(request);
    });
    const report = await runDoctor({
      runtime: runtime({ platform: () => "darwin", release: () => "25.0.0" }),
      probe: nativeFailureProbe,
      workspaceRoot: "/repo",
    });
    const codexDoctor = report.checks.find((check) => check.id === "codex-doctor");
    expect(codexDoctor).toMatchObject({
      status: "failed",
      evidence: { fail: "1", total: "1" },
    });
    expect(JSON.stringify(codexDoctor)).not.toContain("not forwarded");
  });

  it("returns unverified for an unknown platform", async () => {
    const report = await runDoctor({
      runtime: runtime({ platform: () => "aix" }),
      probe: readyProbe(),
    });
    expect(report.environment.kind).toBe("unknown");
    expect(report.summary.status).toBe("unverified");
  });

  it("turns a detection exception into a structured failed report", async () => {
    const report = await runDoctor({
      runtime: runtime({
        release: () => {
          throw new Error("release unavailable");
        },
      }),
    });
    expect(report.summary.status).toBe("failed");
    expect(report.checks[0]?.message).toContain("release unavailable");
  });

  it("enforces redaction at the runner boundary", async () => {
    const checks: CheckDefinition[] = [
      {
        id: "unsafe",
        label: "Unsafe fixture",
        source: "process",
        timeoutMs: 100,
        async run() {
          return {
            status: "ready",
            message: "token=ghp_1234567890abcdefghijkl",
            evidence: { path: "C:\\Users\\Alice\\private", secret: "sk-abcdefghijklmnop" },
            nextAction: "Open C:\\Users\\Alice\\private",
          };
        },
      },
    ];
    const report = await runDoctor({ runtime: runtime(), checks, workspaceRoot: "C:\\repo" });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("ghp_");
    expect(serialized).not.toContain("sk-abcdefghijklmnop");
    expect(serialized).not.toContain("C:\\\\Users\\\\Alice");
    expect(serialized).toContain("[redacted]");
  });

  it("converts timeouts and thrown checks without rejecting", async () => {
    const checks: CheckDefinition[] = [
      {
        id: "hang",
        label: "Hang",
        source: "process",
        timeoutMs: 5,
        run: () => new Promise(() => undefined),
      },
      {
        id: "throw",
        label: "Throw",
        source: "process",
        timeoutMs: 100,
        async run() {
          throw new Error("fixture failed");
        },
      },
    ];
    const report = await runDoctor({ runtime: runtime(), checks, concurrency: 2 });
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ["hang", "unverified"],
      ["throw", "failed"],
    ]);
  });

  it("does not treat denied probes as ready", async () => {
    const denied = probe(() => ({
      outcome: "denied",
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
    }));
    const report = await runDoctor({ runtime: runtime(), probe: denied });
    expect(report.summary.status).toBe("unverified");
    expect(report.checks.filter((check) => check.source !== "runtime")).toSatisfy(
      (checks: DoctorCheck[]) => checks.every((check) => check.status === "unverified"),
    );
  });
});

function check(id: string, status: DoctorCheck["status"]): DoctorCheck {
  return {
    id,
    targetId: "windows-host",
    label: id,
    status,
    source: "runtime",
    message: `${id} is ${status}`,
    evidence: {},
    durationMs: 0,
  };
}

describe("summarizeChecks", () => {
  it("derives readiness from the complete check set", () => {
    expect(summarizeChecks([check("environment", "ready"), check("node", "ready")])).toEqual({
      status: "ready",
      ready: 2,
      unverified: 0,
      failed: 0,
    });
    expect(
      summarizeChecks([check("environment", "ready"), check("node", "unverified")]),
    ).toMatchObject({ status: "unverified" });
    expect(
      summarizeChecks([check("environment", "unverified"), check("node", "failed")]),
    ).toMatchObject({ status: "failed" });
    expect(summarizeChecks([])).toEqual({
      status: "unverified",
      ready: 0,
      unverified: 0,
      failed: 0,
    });
  });
});
