import { describe, expect, it } from "vitest";
import { parseNativeCodexDoctor } from "./codexDoctor.js";

describe("parseNativeCodexDoctor", () => {
  it.each([
    ["ok", { ok: { status: "ok" } }, "ready"],
    ["warning", { ok: { status: "ok" }, warn: { status: "warning" } }, "unverified"],
    ["fail", { bad: { status: "fail" } }, "failed"],
  ] as const)("maps native %s reports", (overallStatus, checks, expected) => {
    const outcome = parseNativeCodexDoctor(
      JSON.stringify({ schemaVersion: 1, overallStatus, codexVersion: "0.149.1", checks }),
    );
    expect(outcome?.status).toBe(expected);
  });

  it("rejects malformed or unknown schemas", () => {
    expect(parseNativeCodexDoctor("not json")).toBeUndefined();
    expect(
      parseNativeCodexDoctor(JSON.stringify({ schemaVersion: 2, checks: {} })),
    ).toBeUndefined();
    expect(
      parseNativeCodexDoctor(JSON.stringify({ schemaVersion: 1, checks: [] })),
    ).toBeUndefined();
  });

  it("projects counts without forwarding native details", () => {
    const outcome = parseNativeCodexDoctor(
      JSON.stringify({
        schemaVersion: 1,
        overallStatus: "fail",
        checks: {
          auth: {
            status: "fail",
            details: "C:\\Users\\Alice\\secret",
            remediation: "token=ghp_1234567890abcdefghijkl",
          },
        },
      }),
    );
    const serialized = JSON.stringify(outcome);
    expect(outcome?.evidence).toMatchObject({ total: "1", fail: "1" });
    expect(serialized).not.toContain("Alice");
    expect(serialized).not.toContain("ghp_");
  });
});
