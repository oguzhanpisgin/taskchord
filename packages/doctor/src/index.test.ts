import { DOCTOR_SCHEMA_VERSION, type DoctorCheck } from "@taskchord/contracts";
import { describe, expect, it } from "vitest";
import { type DoctorRuntime, detectEnvironment, runDoctor, summarizeChecks } from "./index.js";

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

describe("detectEnvironment", () => {
  it.each([
    ["win32", {}, "10.0.26100", "windows"],
    ["darwin", {}, "25.0.0", "macos"],
    ["linux", {}, "6.12.0-generic", "linux"],
    ["freebsd", {}, "15.0", "unknown"],
  ] as const)("classifies %s as %s", (platform, environment, release, expected) => {
    expect(detectEnvironment({ platform, environment, release })).toBe(expected);
  });

  it("detects WSL from environment markers", () => {
    expect(
      detectEnvironment({
        platform: "linux",
        environment: { WSL_DISTRO_NAME: "Ubuntu-24.04" },
        release: "6.6.87.2-microsoft-standard-WSL2",
      }),
    ).toBe("wsl");
  });

  it("detects WSL from the Linux release when environment markers are absent", () => {
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
  it("returns a ready report for a recognized environment", async () => {
    const report = await runDoctor(runtime());

    expect(report).toMatchObject({
      schemaVersion: DOCTOR_SCHEMA_VERSION,
      generatedAt: fixedDate.toISOString(),
      environment: {
        kind: "windows",
        platform: "win32",
        architecture: "x64",
      },
      summary: {
        status: "ready",
        ready: 1,
        unverified: 0,
        failed: 0,
      },
    });
  });

  it("returns unverified for an unknown platform", async () => {
    const report = await runDoctor(runtime({ platform: () => "aix" }));

    expect(report.environment.kind).toBe("unknown");
    expect(report.summary.status).toBe("unverified");
  });

  it("turns a detection exception into a structured failed report", async () => {
    const report = await runDoctor(
      runtime({
        release: () => {
          throw new Error("release unavailable");
        },
      }),
    );

    expect(report.summary.status).toBe("failed");
    expect(report.checks[0]?.message).toContain("release unavailable");
  });
});

function check(id: string, status: DoctorCheck["status"]): DoctorCheck {
  return {
    id,
    label: id,
    status,
    message: `${id} is ${status}`,
    evidence: {},
  };
}

describe("summarizeChecks", () => {
  it("counts every check and remains ready only when all checks are ready", () => {
    expect(summarizeChecks([check("environment", "ready"), check("node", "ready")])).toEqual({
      status: "ready",
      ready: 2,
      unverified: 0,
      failed: 0,
    });
  });

  it("uses unverified when any check is unverified and none failed", () => {
    expect(summarizeChecks([check("environment", "ready"), check("node", "unverified")])).toEqual({
      status: "unverified",
      ready: 1,
      unverified: 1,
      failed: 0,
    });
  });

  it("gives failed precedence over every other status", () => {
    expect(summarizeChecks([check("environment", "unverified"), check("node", "failed")])).toEqual({
      status: "failed",
      ready: 0,
      unverified: 1,
      failed: 1,
    });
  });

  it("does not report an empty check set as ready", () => {
    expect(summarizeChecks([])).toEqual({
      status: "unverified",
      ready: 0,
      unverified: 0,
      failed: 0,
    });
  });
});
