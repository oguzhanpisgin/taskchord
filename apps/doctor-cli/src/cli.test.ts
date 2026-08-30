import { DOCTOR_SCHEMA_VERSION, type DoctorReport } from "@taskchord/contracts";
import { describe, expect, it } from "vitest";
import { executeCli } from "./cli.js";

const report: DoctorReport = {
  schemaVersion: DOCTOR_SCHEMA_VERSION,
  generatedAt: "2026-08-30T12:00:00.000Z",
  environment: {
    kind: "windows",
    platform: "win32",
    architecture: "x64",
    release: "10.0.26100",
  },
  checks: [
    {
      id: "environment",
      label: "Environment",
      status: "ready",
      message: "Detected Windows.",
      evidence: {
        platform: "win32",
        architecture: "x64",
        release: "10.0.26100",
      },
    },
  ],
  summary: {
    status: "ready",
    ready: 1,
    unverified: 0,
    failed: 0,
  },
};

const environmentCheck = report.checks[0];
if (environmentCheck === undefined) {
  throw new Error("The CLI fixture must include an environment check.");
}

describe("executeCli", () => {
  it("prints help when invoked without arguments", async () => {
    const result = await executeCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("taskchord doctor [--json]");
  });

  it("prints every check in text and the same DoctorReport as JSON", async () => {
    const multiCheckReport: DoctorReport = {
      ...report,
      checks: [
        ...report.checks,
        {
          id: "node",
          label: "Node.js",
          status: "ready",
          message: "Detected Node.js.",
          evidence: { version: "24.19.0" },
        },
      ],
      summary: { status: "ready", ready: 2, unverified: 0, failed: 0 },
    };
    const doctor = async () => multiCheckReport;
    const text = await executeCli(["doctor"], doctor);
    const json = await executeCli(["doctor", "--json"], doctor);

    expect(text.report).toBe(multiCheckReport);
    expect(json.report).toBe(multiCheckReport);
    expect(text.stdout).toContain("Environment:  Windows");
    expect(text.stdout).toContain("- Environment: READY");
    expect(text.stdout).toContain("- Node.js: READY");
    expect(JSON.parse(json.stdout)).toEqual(multiCheckReport);
  });

  it("returns exit code 1 for an unverified report", async () => {
    const result = await executeCli(["doctor"], async () => ({
      ...report,
      environment: { ...report.environment, kind: "unknown" },
      checks: [{ ...environmentCheck, status: "unverified" }],
      summary: { status: "unverified", ready: 0, unverified: 1, failed: 0 },
    }));

    expect(result.exitCode).toBe(1);
  });

  it("returns exit code 1 for a detection failure", async () => {
    const result = await executeCli(["doctor"], async () => ({
      ...report,
      environment: {
        kind: "unknown",
        platform: "unknown",
        architecture: "unknown",
        release: "unknown",
      },
      checks: [
        {
          id: "environment",
          label: "Environment",
          status: "failed",
          message: "Environment detection failed: unavailable",
          evidence: {},
        },
      ],
      summary: { status: "failed", ready: 0, unverified: 0, failed: 1 },
    }));

    expect(result.exitCode).toBe(1);
  });

  it("returns exit code 2 for an invalid option", async () => {
    const result = await executeCli(["doctor", "--write"], async () => report);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown option");
  });
});
