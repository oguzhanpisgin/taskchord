import type { ProbeRequest, ProbeResult, ProcessProbe } from "@taskchord/doctor";
import { describe, expect, it } from "vitest";
import {
  applyProofEvidence,
  collectGitProof,
  compareCommitRelation,
  createHumanDecision,
  createPassiveProofReport,
  discoverVerificationScripts,
  type GitProofEvidence,
  type PullRequestInput,
  parseNameStatus,
  parsePorcelainV2,
  renderProofMarkdown,
  renderVerificationPreview,
  type VerificationRunRecord,
} from "./index.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const BASE = "abcdef0123456789abcdef0123456789abcdef01";

function evidence(overrides: Partial<GitProofEvidence> = {}): GitProofEvidence {
  return {
    subject: {
      workspaceFolderUri: "file:///repo",
      repository: "owner/repo",
      branch: "feature",
      headSha: SHA,
      baseBranch: "main",
      detached: false,
    },
    fingerprint: "proof-fingerprint",
    files: [{ path: "src/index.ts", status: "M", source: "committed" }],
    filesTruncated: false,
    treeDirty: false,
    hasCommittedDelta: true,
    commitSummary: "0123456 add proof",
    observedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

const openPr: PullRequestInput = {
  kind: "available",
  relation: "equal",
  pullRequest: {
    number: 7,
    title: "Proof",
    url: "https://github.com/owner/repo/pull/7",
    state: "OPEN",
    isDraft: false,
    headSha: SHA,
    baseBranch: "main",
    reviewDecision: "",
    checks: [],
  },
};

describe("passive Proof report", () => {
  it("always carries all six strips and keeps Part 2 evidence missing or pending", () => {
    const report = createPassiveProofReport(evidence(), openPr);
    expect(Object.keys(report.strips)).toEqual([
      "changed-files",
      "build",
      "tests",
      "commit",
      "pr-ci",
      "human-decision",
    ]);
    expect(report.strips.build.status).toBe("missing");
    expect(report.strips.tests.status).toBe("missing");
    expect(report.strips["human-decision"].status).toBe("pending");
    expect(report.technicalReadiness).toBe("not-ready");
    expect(report.unresolvedTechnicalStrips).toEqual(["build", "tests"]);
  });

  it("classifies dirty commits and PR/CI states without hiding failures", () => {
    const report = createPassiveProofReport(evidence({ treeDirty: true }), {
      ...openPr,
      pullRequest: {
        ...openPr.pullRequest,
        checks: [{ name: "tests", status: "failed" }],
      },
    });
    expect(report.strips.commit.status).toBe("pending");
    expect(report.strips["pr-ci"].status).toBe("failed");
    expect(report.unresolvedTechnicalStrips).toContain("commit");
    expect(report.unresolvedTechnicalStrips).toContain("pr-ci");
  });

  it("does not accept skipped, neutral, or unknown checks as CI proof", () => {
    for (const name of ["skipped", "neutral", "unknown"]) {
      const report = createPassiveProofReport(evidence(), {
        ...openPr,
        pullRequest: {
          ...openPr.pullRequest,
          checks: [{ name, status: "unverified" }],
        },
      });
      expect(report.strips["pr-ci"].status).toBe("unverified");
      expect(report.unresolvedTechnicalStrips).toContain("pr-ci");
    }
  });

  it("renders validated full SHA and every strip in Markdown", () => {
    const markdown = renderProofMarkdown(createPassiveProofReport(evidence(), openPr));
    expect(markdown).toContain(SHA);
    for (const heading of [
      "Changed files",
      "Build",
      "Tests",
      "Commit",
      "PR / CI",
      "Human decision",
    ]) {
      expect(markdown).toContain(`## ${heading}`);
    }
  });
});

describe("approved verification evidence", () => {
  const manifest = JSON.stringify({
    packageManager: "pnpm@11.19.0",
    scripts: {
      build: "tsc -b",
      "build:extension": "node build.mjs",
      test: "vitest run",
      lint: "biome check .",
    },
  });

  function scripts() {
    const discovery = discoverVerificationScripts(manifest, ["pnpm-lock.yaml"]);
    expect(discovery.ok).toBe(true);
    if (!discovery.ok) throw new Error(discovery.reason);
    return discovery.scripts;
  }

  function run(
    kind: "build" | "tests",
    scriptName: string,
    exitCode: number | null = 0,
  ): VerificationRunRecord {
    const script = scripts().find((candidate) => candidate.name === scriptName);
    if (script === undefined) throw new Error("missing script fixture");
    return {
      kind,
      scriptName,
      definitionHash: script.definitionHash,
      runnerCommand: script.runnerCommand,
      startedAt: "2026-08-30T01:00:00.000Z",
      finishedAt: "2026-08-30T01:01:00.000Z",
      exitCode,
      startFingerprint: "proof-fingerprint",
      endFingerprint: "proof-fingerprint",
    };
  }

  it("discovers only supported root scripts and prefers packageManager", () => {
    const discovery = discoverVerificationScripts(manifest, ["yarn.lock"]);
    expect(discovery).toMatchObject({ ok: true, manager: "pnpm" });
    if (!discovery.ok) return;
    expect(discovery.scripts.map(({ kind, name }) => ({ kind, name }))).toEqual([
      { kind: "build", name: "build" },
      { kind: "build", name: "build:extension" },
      { kind: "tests", name: "test" },
    ]);
    expect(discovery.scripts.every((script) => script.runnerCommand[1] === "run")).toBe(true);
  });

  it("requires an unambiguous supported lockfile when packageManager is absent", () => {
    const withoutManager = JSON.stringify({ scripts: { build: "tsc" } });
    expect(discoverVerificationScripts(withoutManager, ["pnpm-lock.yaml", "yarn.lock"])).toEqual({
      ok: false,
      reason: "A single pnpm, npm, or yarn lockfile is required.",
    });
    expect(discoverVerificationScripts(withoutManager, ["package-lock.json"])).toMatchObject({
      ok: true,
      manager: "npm",
    });
  });

  it("renders the complete immutable verification preview", () => {
    const script = scripts().find((candidate) => candidate.name === "build");
    if (script === undefined) throw new Error("missing script fixture");
    const preview = renderVerificationPreview({
      packageJsonPath: "C:\\repo\\package.json",
      cwd: "C:\\repo",
      script,
    });
    expect(preview).toContain("**package.json:** C:\\repo\\package.json");
    expect(preview).toContain("**Working directory:** C:\\repo");
    expect(preview).toContain("**Package manager:** pnpm");
    expect(preview).toContain("**Script name:** build");
    expect(preview).toContain("**Script body:** `tsc -b`");
    expect(preview).toContain("**Command:** `pnpm run build`");
  });

  it("maps exit results and fingerprint changes without false green", () => {
    const passive = createPassiveProofReport(evidence(), openPr);
    const passed = applyProofEvidence(passive, {
      scripts: scripts(),
      build: run("build", "build"),
      tests: run("tests", "test"),
    });
    expect(passed.strips.build.status).toBe("passed");
    expect(passed.strips.tests.status).toBe("passed");
    expect(passed.technicalReadiness).toBe("ready-for-human-review");

    expect(
      applyProofEvidence(passive, {
        scripts: scripts(),
        build: run("build", "build", 1),
      }).strips.build.status,
    ).toBe("failed");
    expect(
      applyProofEvidence(passive, {
        scripts: scripts(),
        build: run("build", "build", null),
      }).strips.build.status,
    ).toBe("unverified");

    const changedDuring = run("build", "build");
    expect(
      applyProofEvidence(passive, {
        scripts: scripts(),
        build: { ...changedDuring, startFingerprint: "different" },
      }).strips.build.status,
    ).toBe("unverified");

    const changedLater = createPassiveProofReport(
      evidence({ fingerprint: "new-workspace-fingerprint" }),
      openPr,
    );
    expect(
      applyProofEvidence(changedLater, {
        scripts: scripts(),
        build: run("build", "build"),
      }).strips.build.status,
    ).toBe("stale");
  });

  it("keeps unresolved proof visible when accepted and stales decisions after evidence changes", () => {
    const passive = createPassiveProofReport(evidence(), openPr);
    const accepted = applyProofEvidence(passive, {
      scripts: scripts(),
      humanDecision: createHumanDecision(
        "accepted",
        passive.technicalFingerprint,
        new Date("2026-08-30T02:00:00.000Z"),
      ),
    });
    expect(accepted.humanDecision.decision).toBe("accepted");
    expect(accepted.strips["human-decision"].status).toBe("passed");
    expect(accepted.unresolvedTechnicalStrips).toEqual(["build", "tests"]);

    const changed = createPassiveProofReport(
      evidence({ fingerprint: "changed-proof-fingerprint" }),
      openPr,
    );
    const stale = applyProofEvidence(changed, {
      scripts: scripts(),
      humanDecision: accepted.humanDecision,
    });
    expect(stale.humanDecision.decision).toBe("stale");
    expect(stale.strips["human-decision"].status).toBe("stale");
  });
});

describe("Git evidence parsing", () => {
  it("parses ordinary, renamed, and untracked porcelain v2 records", () => {
    const output = [
      "1 M. N... 100644 100644 100644 aaaaaaa bbbbbbb src/a.ts",
      "2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 src/new.ts",
      "src/old.ts",
      "? new.txt",
      "",
    ].join("\0");
    expect(parsePorcelainV2(output)).toEqual([
      { path: "src/a.ts", code: "M.", deleted: false },
      { path: "src/new.ts", code: "R.", deleted: false },
      { path: "new.txt", code: "??", deleted: false },
    ]);
  });

  it("parses NUL name-status including rename targets", () => {
    expect(parseNameStatus("M\0src/a.ts\0R100\0old.ts\0new.ts\0")).toEqual([
      { path: "src/a.ts", status: "M", source: "committed" },
      { path: "new.ts", status: "R100", source: "committed" },
    ]);
  });
});

class FixtureProbe implements ProcessProbe {
  readonly requests: ProbeRequest[] = [];
  constructor(private readonly responses: ProbeResult[]) {}
  async run(request: ProbeRequest): Promise<ProbeResult> {
    this.requests.push(request);
    const result = this.responses.shift();
    if (result === undefined) throw new Error("missing fixture response");
    return result;
  }
}

function result(stdout: string, exitCode = 0): ProbeResult {
  return { outcome: "completed", exitCode, stdout, stderr: "", durationMs: 1 };
}

describe("Git Proof collector", () => {
  it("uses fixed read-only argv, stdin hashing, and preserves strict SHA", async () => {
    const probe = new FixtureProbe([
      result(SHA),
      result("feature\n"),
      result(BASE),
      result("? new.txt\0"),
      result("0123456 add proof\n"),
      result(`M\0src/index.ts\0`),
      result("9999999999999999999999999999999999999999\n"),
    ]);
    const proof = await collectGitProof(probe, {
      workspaceFolderUri: "file:///repo",
      workspacePath: "C:\\repo",
      repository: "owner/repo",
      baseBranch: "main",
      now: new Date("2026-08-30T00:00:00.000Z"),
    });
    expect(proof.ok).toBe(true);
    if (!proof.ok) return;
    expect(proof.evidence.subject.headSha).toBe(SHA);
    expect(proof.evidence.files.map((file) => file.path)).toEqual(["src/index.ts", "new.txt"]);
    const hashRequest = probe.requests.find((request) => request.args[0] === "hash-object");
    expect(hashRequest?.args).toEqual(["hash-object", "--stdin-paths"]);
    expect(hashRequest?.stdin).toBe("new.txt\n");
    expect(probe.requests.every((request) => request.command === "git")).toBe(true);
    const diffRequest = probe.requests.find((request) => request.args.includes("diff"));
    expect(diffRequest?.args.slice(0, 3)).toEqual(["-c", "diff.external=", "diff"]);
  });

  it("distinguishes ahead, behind, and diverged commit relations", async () => {
    for (const [responses, expected] of [
      [[result("", 0), result("", 1)], "local-ahead"],
      [[result("", 1), result("", 0)], "local-behind"],
      [[result("", 1), result("", 1)], "diverged"],
    ] as const) {
      const probe = new FixtureProbe([...responses]);
      await expect(compareCommitRelation(probe, "C:\\repo", SHA, BASE)).resolves.toBe(expected);
    }
  });

  it("rejects more than 500 combined committed files instead of truncating to passed", async () => {
    const committed = Array.from({ length: 501 }, (_, index) => `A\0src/file-${index}.ts\0`).join(
      "",
    );
    const probe = new FixtureProbe([
      result(SHA),
      result("feature\n"),
      result(BASE),
      result(""),
      result("0123456 add proof\n"),
      result(committed),
    ]);
    const proof = await collectGitProof(probe, {
      workspaceFolderUri: "file:///repo",
      workspacePath: "C:\\repo",
      repository: "owner/repo",
      baseBranch: "main",
      now: new Date("2026-08-30T00:00:00.000Z"),
    });
    expect(proof).toEqual({
      ok: false,
      summary: "Changed files exceed TaskChord Proof inspection limits.",
      observedAt: "2026-08-30T00:00:00.000Z",
    });
  });
});
