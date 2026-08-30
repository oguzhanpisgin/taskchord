import { DOCTOR_SCHEMA_VERSION, type DoctorReport } from "@taskchord/contracts";
import type { OptionalRunnerReport } from "@taskchord/runners";
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
  targets: [
    {
      id: "windows-host",
      kind: "windows",
      label: "Windows host",
      facts: {
        kind: "windows",
        platform: "win32",
        architecture: "x64",
        release: "10.0.26100",
      },
    },
  ],
  checks: [
    {
      id: "environment",
      targetId: "windows-host",
      label: "Environment",
      status: "ready",
      source: "runtime",
      message: "Detected Windows.",
      evidence: { platform: "win32" },
      durationMs: 1,
    },
    {
      id: "node",
      targetId: "windows-host",
      label: "Node.js",
      status: "unverified",
      source: "process",
      message: "Node.js was not checked.",
      evidence: {},
      durationMs: 1,
      nextAction: "Install Node.js.",
    },
  ],
  summary: { status: "unverified", ready: 1, unverified: 1, failed: 0 },
};

const runners: OptionalRunnerReport = {
  schemaVersion: 1,
  symphony: {
    endpoint: "http://127.0.0.1:4000/api/v1/state",
    availability: "ready",
    freshness: "fresh",
    observedAt: "2026-08-30T12:00:01.000Z",
    latencyMs: 4,
    generatedAt: "2026-08-30T12:00:00.000Z",
    counts: { running: 1, blocked: 0 },
    associations: { current: 0, other: 1, unknown: 0, truncated: false },
  },
  codexAppServer: { availability: "supported", codexVersion: "codex-cli 0.151.0" },
  fallback: "native-handoff",
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
    expect(items[0]?.tooltip).toContain("Target: Windows host");
    expect(items[0]?.tooltip).toContain("platform: win32");
    expect(items[1]?.tooltip).toContain("Next action: Install Node.js.");
  });

  it("adds safe optional runner summaries without raw runner payloads", () => {
    const items = toSetupItems(report, runners);
    const symphony = items.find((item) => item.id === "runner-symphony");
    const appServer = items.find((item) => item.id === "runner-codex-app-server");
    expect(symphony?.label).toBe("Symphony state (preview, read-only)");
    expect(symphony?.description).toBe("READY · FRESH");
    expect(symphony?.tooltip).toContain("Instance-wide running: 1");
    expect(symphony?.tooltip).toContain("Fallback: Native Codex handoff remains available.");
    expect(appServer?.label).toBe("Codex App Server (not connected)");
    expect(appServer?.description).toBe("SUPPORTED · NOT CONNECTED");
  });
});
