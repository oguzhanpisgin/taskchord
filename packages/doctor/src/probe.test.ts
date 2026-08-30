import { describe, expect, it } from "vitest";
import { filteredEnvironment, nodeProcessProbe, type ProbeCommand } from "./probe.js";

describe("filteredEnvironment", () => {
  it("removes credential-shaped variables and preserves PATH", () => {
    expect(
      filteredEnvironment({
        PATH: "safe-path",
        GH_TOKEN: "secret",
        AWS_SECRET_KEY: "secret",
        ORDINARY_VALUE: "kept",
      }),
    ).toEqual({ PATH: "safe-path", ORDINARY_VALUE: "kept" });
  });
});

describe("nodeProcessProbe", () => {
  it("denies commands outside the fixed allowlist", async () => {
    const result = await nodeProcessProbe.run({
      command: "powershell" as ProbeCommand,
      args: [],
      timeoutMs: 100,
    });
    expect(result.outcome).toBe("denied");
  });

  it("runs an allowlisted executable without a shell", async () => {
    const result = await nodeProcessProbe.run({
      command: "node",
      args: ["--version"],
      timeoutMs: 3_000,
    });
    expect(result).toMatchObject({ outcome: "completed", exitCode: 0 });
    expect(result.stdout).toMatch(/^v\d+/u);
  });

  it("bounds a long-running probe", async () => {
    const result = await nodeProcessProbe.run({
      command: "node",
      args: ["-e", "setTimeout(() => {}, 10000)"],
      timeoutMs: 25,
    });
    expect(result.outcome).toBe("timeout");
  });
});
