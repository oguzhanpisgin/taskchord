import { DOCTOR_SCHEMA_VERSION, type DoctorReport } from "@taskchord/contracts";
import { describe, expect, it } from "vitest";
import { toSetupItems } from "./setupModel.js";

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
      evidence: { platform: "win32" },
    },
    {
      id: "node",
      label: "Node.js",
      status: "unverified",
      message: "Node.js was not checked.",
      evidence: {},
    },
  ],
  summary: { status: "unverified", ready: 1, unverified: 1, failed: 0 },
};

describe("toSetupItems", () => {
  it("returns no items before the user runs Doctor", () => {
    expect(toSetupItems(undefined)).toEqual([]);
  });

  it("creates one native setup item per Doctor check", () => {
    const items = toSetupItems(report);

    expect(items).toHaveLength(2);
    expect(items.map((item) => [item.id, item.status])).toEqual([
      ["environment", "ready"],
      ["node", "unverified"],
    ]);
    expect(items[0]?.tooltip).toContain("Doctor environment: Windows");
    expect(items[0]?.tooltip).toContain("platform: win32");
  });
});
