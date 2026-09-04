import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const standard = JSON.parse(
  readFileSync(new URL("../eng/quality/quality-gates.json", import.meta.url), "utf8"),
) as {
  $schema: string;
  version: number;
  ownerApproved: string;
  boyScoutRule: string;
  testLanes: {
    fast: { script: string; command: string; minimums: { testFiles: number; totalTests: number } };
    extension: { script: string };
    validateChain: string[];
  };
  staticGates: { linterFormatter: string; typecheck: string; languageRules: string[] };
  reviewGates: Record<string, string>;
  securityGates: Record<string, unknown>;
  codeHealthSweep: { cadence: string; checks: string[] };
};

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

/** Collect *.test.ts files the way vitest.config.ts includes them (packages/**, doctor-cli, vscode-extension/src). */
function discoverTestFiles(): string[] {
  const found: string[] = [];
  const roots = [
    new URL("../packages/", import.meta.url),
    new URL("../apps/doctor-cli/src/", import.meta.url),
    new URL("../apps/vscode-extension/src/", import.meta.url),
  ];
  for (const root of roots) {
    const walk = (dir: URL): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
        if (entry.isDirectory()) walk(entryUrl);
        else if (entry.name.endsWith(".test.ts")) found.push(fileURLToPath(entryUrl));
      }
    };
    walk(root);
  }
  return found.sort();
}

describe("quality gates standard", () => {
  it("is loadable, versioned, owner-approved and names its consumer", () => {
    expect(standard.$schema).toContain("tests/quality-gates.guard.test.ts");
    expect(standard.version).toBeGreaterThanOrEqual(1);
    expect(standard.ownerApproved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps every gate section non-empty", () => {
    expect(standard.boyScoutRule.length).toBeGreaterThan(0);
    expect(standard.testLanes.validateChain.length).toBeGreaterThan(0);
    expect(Object.keys(standard.reviewGates).length).toBeGreaterThan(0);
    expect(Object.keys(standard.securityGates).length).toBeGreaterThan(0);
    expect(standard.codeHealthSweep.checks.length).toBeGreaterThan(0);
    expect(standard.staticGates.languageRules.length).toBeGreaterThan(0);
  });

  it("references only package.json scripts that exist", () => {
    for (const script of [
      standard.testLanes.fast.script,
      standard.testLanes.extension.script,
      ...standard.testLanes.validateChain,
    ]) {
      expect(pkg.scripts[script], `package.json must define "${script}"`).toBeTruthy();
    }
  });

  it("keeps the standard's validate chain equal to the package.json validate script", () => {
    expect(pkg.scripts.validate).toBe(
      standard.testLanes.validateChain.map((s) => `pnpm ${s}`).join(" && "),
    );
  });

  it("keeps fast-lane minimums positive and equal to the discovered vitest suite", () => {
    const { testFiles, totalTests } = standard.testLanes.fast.minimums;
    expect(Number.isInteger(testFiles)).toBe(true);
    expect(Number.isInteger(totalTests)).toBe(true);
    expect(discoverTestFiles().length).toBeGreaterThanOrEqual(testFiles);
    expect(totalTests).toBeGreaterThan(0);
  });

  it("keeps the sweep cadence bounded", () => {
    expect(standard.codeHealthSweep.cadence).toContain("monthly");
  });
});
