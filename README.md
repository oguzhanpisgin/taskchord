# TaskChord

**From issue to reviewed PR**

TaskChord is a free and open-source IDE work layer for safely completing Codex/Symphony/GitHub setup and managing issue-to-reviewed-PR work without leaving the IDE.

## Current status

Slice 001 provides a read-only environment doctor, the `taskchord doctor` CLI, and a native VS Code Workbench shell with Setup, Work, and Proof views. GitHub, Symphony, Codex, installer, and workflow mutations remain outside this slice.

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
