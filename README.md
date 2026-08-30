# TaskChord

**From issue to reviewed PR**

TaskChord is a free and open-source IDE-native trust and workflow layer that verifies a Codex user's environment, turns intent into a durable GitHub Issue contract, and prepares agent output for human review with deterministic proof.

GitHub is the durable work, PR, and CI truth. Codex is the only code writer. Symphony is an optional orchestrator. TaskChord owns the contract, visibility, and proof; the human remains the final judge.

## Current status

Slice 001 is complete at commit `3e1a2c7`. It provides a read-only environment doctor, the `taskchord doctor` CLI, and a native VS Code Workbench shell with Setup, Work, and Proof views.

The next candidate is the not-yet-implemented **Slice 002 — Doctor Aggregator v2**. It will extend the existing environment core with native `codex doctor --json`, Git, GitHub, Node/pnpm, WSL, and repository-readiness checks. Slice 002 requires its own approval before implementation.

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
