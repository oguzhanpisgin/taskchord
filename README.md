# TaskChord

**From issue to reviewed PR**

TaskChord is a free and open-source IDE-native trust and workflow layer that verifies a Codex user's environment, turns intent into a durable GitHub Issue contract, and prepares agent output for human review with deterministic proof.

GitHub is the durable work, PR, and CI truth. Codex is the only code writer. Symphony is an optional orchestrator. TaskChord owns the contract, visibility, and proof; the human remains the final judge.

## Current status

Slice 001 was implemented at commit `3e1a2c7` and then realigned with the current architecture. Slice 002 provides the read-only Doctor Aggregator: host-local environment, Git, Node.js, GitHub CLI authentication, repository, and native Codex Doctor checks, plus separate Windows/WSL target measurements. The CLI and native Setup view render the same redacted, target-bound report; Doctor still runs only when the user requests it.

Slice 003 provides the native Issue Contract Workbench: on-demand open-Issue listing, extension-storage Markdown drafts, deterministic Intent Scaffold diagnostics, exact write previews, separately approved `gh` create/edit operations, conflict and ambiguous-create safeguards, a local Active Goal projection, and preview-approved clipboard handoff. TaskChord never reads or stores a GitHub token and does not start Codex. Issue #5 on `oguzhanpisgin/taskchord` has passed live GitHub acceptance: exact create readback, exact edit readback, closed as `completed` without comments/metadata changes, with no repository worktree changes left behind.

The next not-yet-implemented candidate is **Slice 004 — Deterministic Proof**.

## Development

Requires Node.js `24.19.0` and pnpm `11.19.0`.

```text
pnpm install
pnpm validate
node apps/doctor-cli/dist/index.js doctor
node apps/doctor-cli/dist/index.js doctor --json
```

The user-facing panel is **TaskChord Workbench**. Its internal VS Code container key is `taskchord-workbench` because VS Code container IDs only accept letters, numbers, `_`, and `-`; the public extension ID remains `taskchord.taskchord`.

## Documents

- [Product and implementation plan](docs/PRODUCT-PLAN.md)
- [First-code approval plan](docs/FIRST-CODE-PLAN.md)

## Frozen identity

- Extension ID: `taskchord.taskchord`
- CLI: `taskchord doctor`
- Main panel: **TaskChord Workbench**
- Proof view: **TaskChord Proof**
