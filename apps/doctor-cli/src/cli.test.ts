import type { DoctorReport } from "@taskchord/contracts";
import { describe, expect, it } from "vitest";
import { executeCli } from "./cli.js";

const report: DoctorReport = {
  schemaVersion: 1,
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

describe("executeCli", () => {
  it("prints help when invoked without arguments", () => {
    const result = executeCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("taskchord doctor [--json]");
  });

  it("prints text and JSON from the same DoctorReport", () => {
    const doctor = () => report;
    const text = executeCli(["doctor"], doctor);
    const json = executeCli(["doctor", "--json"], doctor);

    expect(text.report).toBe(report);
    expect(json.report).toBe(report);
    expect(text.stdout).toContain("Environment:  windows");
    expect(JSON.parse(json.stdout)).toEqual(report);
  });

  it("returns exit code 1 for an unverified report", () => {
    const result = executeCli(["doctor"], () => ({
      ...report,
      environment: { ...report.environment, kind: "unknown" },
      summary: { status: "unverified", ready: 0, unverified: 1, failed: 0 },
    }));

    expect(result.exitCode).toBe(1);
  });

  it("returns exit code 1 for a detection failure", () => {
    const result = executeCli(["doctor"], () => ({
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

  it("returns exit code 2 for an invalid option", () => {
    const result = executeCli(["doctor", "--write"], () => report);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown option");
  });
});
